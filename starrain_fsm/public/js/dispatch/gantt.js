(function() {
    "use strict";

    const START_TIME_MINUTES = 420;   
    const END_TIME_MINUTES = 1140;     
    const TOTAL_WORKING_MINUTES = END_TIME_MINUTES - START_TIME_MINUTES;
    // Color Map - i'll change to uppercase
    const STATUS_COLORS = {
        "scheduled": "#007bff",
        "rescheduled": "#28a745",
        "completed": "#6c757d",
        "cancelled": "#dc3545"
    };

    // Global variable holding the currently selected date
    let currentSelectedDate = frappe.datetime.get_today();

    // --- Utility Functions ---
    function isMobile() {
        return window.innerWidth < 768;
    }

    function generate_date_range(selected_date) {
        let dates = [];
        if (isMobile()) {
            for (let i = -2; i <= 2; i++) {
                dates.push(frappe.datetime.add_days(selected_date, i));
            }
        } else {
            let today_index = 9;
            for (let i = -today_index; i <= (19 - today_index - 1); i++) {
                dates.push(frappe.datetime.add_days(selected_date, i));
            }
        }
        return dates;
    }

    function timeStringToMinutes(timeStr) {
        if (!timeStr) return 0;
        const parts = timeStr.split(":");
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }

    function minutesToTimeString(minutes) {
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return ("0" + hrs).slice(-2) + ":" + ("0" + mins).slice(-2);
    }

    function roundToNearestTen(mins) {
        return Math.round(mins / 10) * 10;
    }

    // If timeStr already includes seconds, do not append an extra ":00"
    function formatDatetime(date, timeStr) {
        timeStr = timeStr.trim();
        if (timeStr.split(":").length >= 3) {
            return date + " " + timeStr;
        } else {
            return date + " " + timeStr + ":00";
        }
    }

    function calculatePosition(startMins, endMins) {
        const leftPercent = ((startMins - START_TIME_MINUTES) / TOTAL_WORKING_MINUTES) * 100;
        const widthPercent = ((endMins - startMins) / TOTAL_WORKING_MINUTES) * 100;
        return { leftPercent, widthPercent };
    }

    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    
    function create_appointment(selected_date, service_order, scheduledStartDatetime, scheduledFinishDatetime, technician, dispatch, callback) {
        frappe.call({
            method: "starrain_fsm.field_service_management.page.dispatch.dispatch.create_service_appointment",
            args: {
                selected_date,
                service_order,
                scheduled_start_datetime: scheduledStartDatetime,
                scheduled_finish_datetime: scheduledFinishDatetime,
                technician,
                dispatch: dispatch ? 1 : 0
            },
            callback: (r) => {
                if (!r.exc) {
                    if (callback) callback(r.message);
                } else {
                    frappe.msgprint("Failed to create appointment.");
                }
            }
        });
    }

    function update_appointment(appointment_id, selected_date, service_order, scheduledStartDatetime, scheduledFinishDatetime, technician) {
        frappe.call({
            method: "starrain_fsm.field_service_management.page.dispatch.dispatch.update_service_appointment",
            args: {
                appointment_id,
                selected_date,
                service_order,
                scheduled_start_datetime: scheduledStartDatetime,
                scheduled_finish_datetime: scheduledFinishDatetime,
                technician
            },
            callback: (r) => {
                if (!r.exc) {
                    // Optionally notify user
                } else {
                    frappe.msgprint("Failed to update appointment.");
                }
            }
        });
    }

    // --- UI Rendering Functions ---
    function renderGanttUI(container) {
        const pageBodyHTML = `
        <div class="gantt-view">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <h3 id="month-header"></h3>
                <div>
                    <button class="btn btn-sm btn-secondary mr-2" id="select-date-btn">
                        <i class="fa fa-calendar"></i>
                    </button>
                    <button class="btn btn-sm btn-primary mr-2" id="today-btn">Today</button>
                    <button class="btn btn-sm btn-secondary mr-2" id="tomorrow-btn">Tomorrow</button>
                </div>
            </div>
            <div id="month-row" class="text-center font-weight-bold mb-1"></div>
            <div id="date-table"></div>
            <div id="schedule-grid" ${isMobile() ? 'style="overflow-x:auto;"' : ''}></div>
        </div>
        `;
        container.innerHTML = pageBodyHTML;
        document.getElementById("month-header").textContent =
            new Date(currentSelectedDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }

    function renderDateTable(selected_date) {
        const dates = generate_date_range(selected_date);
        let tableHTML = `<table class="table table-bordered"><thead><tr>`;
        dates.forEach(date => {
            const isSelected = date === selected_date ? 'selected-date' : '';
            const monthName = new Date(date).toLocaleString('en-us', { month: 'short' }).toUpperCase();
            tableHTML += `<th class="date-header ${isSelected}" data-date="${date}" onclick="filter_by_date('${date}')">
                                <div>${formatDate(date)}</div>
                                <div class="small" style="font-size: 8px;">${monthName}</div>
                           </th>`;
        });
        tableHTML += `</tr></thead></table>`;
        document.getElementById("date-table").innerHTML = tableHTML;
    }

    function formatDate(date) {
        const dateObj = new Date(date);
        const dayName = dateObj.toLocaleString('en-us', { weekday: 'short' }).toUpperCase();
        const dayNum = dateObj.getDate();
        return `<div>${dayName}</div><div>${dayNum}</div>`;
    }

    function renderScheduleGrid(technicians, selected_date, appointments) {
        const gridContainer = document.createElement("div");
        gridContainer.className = "schedule-grid-container";
        gridContainer.style.position = "relative";
        gridContainer.style.width = "100%";

        // --- Header Row with Technician Search and Time Labels ---
        const headerRow = document.createElement("div");
        headerRow.className = "technician-row header-row d-flex";
        headerRow.style.height = "40px";
        headerRow.style.borderBottom = "1px solid #ddd";

        const nameCell = document.createElement("div");
        nameCell.className = "technician-name";
        nameCell.style.width = "20%";
        nameCell.style.background = "#f0f0f0";
        nameCell.style.textAlign = "center";
        nameCell.style.lineHeight = "40px";
        nameCell.style.borderRight = "1px solid #ddd";
        nameCell.style.fontSize = isMobile() ? "10px" : "12px";
        nameCell.innerHTML = `<input type="text" id="technician-search" class="form-control form-control-sm" placeholder="Search Technician" style="height: 100%; border: none; outline: none; box-shadow: none; border-radius: 0;">`;

        const timelineCell = document.createElement("div");
        timelineCell.className = "timeline-cell";
        timelineCell.style.width = "80%";
        timelineCell.style.position = "relative";

        for (let m = 0; m < TOTAL_WORKING_MINUTES; m += 60) {
            const rawTime = minutesToTimeString(START_TIME_MINUTES + m);
            const displayTime = isMobile() ? parseInt(rawTime.split(":")[0]) : rawTime;
            const leftPercent = (m / TOTAL_WORKING_MINUTES) * 100;
            const labelDiv = document.createElement("div");
            labelDiv.className = "time-label";
            labelDiv.style.position = "absolute";
            labelDiv.style.left = leftPercent + "%";
            labelDiv.style.transform = "translateX(-50%)";
            labelDiv.style.fontSize = isMobile() ? "10px" : "12px";
            labelDiv.style.color = "#555";
            labelDiv.style.fontWeight = "bold";
            labelDiv.textContent = displayTime;
            timelineCell.appendChild(labelDiv);
        }
        headerRow.appendChild(nameCell);
        headerRow.appendChild(timelineCell);
        gridContainer.appendChild(headerRow);

        // --- Separator ---
        const separator = document.createElement("div");
        separator.style.width = "100%";
        separator.style.borderTop = "1px solid #ddd";
        gridContainer.appendChild(separator);

        // --- Technician Rows ---
        const techRowsContainer = document.createElement("div");
        techRowsContainer.className = "technician-rows";
        technicians.forEach(tech => {
            const techRow = document.createElement("div");
            techRow.className = "technician-row";
            const technician_id = tech.service_technician || tech.name;
            techRow.setAttribute("data-tech", technician_id);
            techRow.style.display = "flex";
            techRow.style.height = "33px";
            techRow.style.borderBottom = "1px solid #ddd";

            const techNameCell = document.createElement("div");
            techNameCell.className = "technician-name";
            techNameCell.style.width = "20%";
            techNameCell.style.background = "#f0f0f0";
            techNameCell.style.textAlign = "center";
            techNameCell.style.lineHeight = "33px";
            techNameCell.style.borderRight = "1px solid #ddd";
            techNameCell.style.fontSize = isMobile() ? "10px" : "12px";
            if (isMobile()) {
                techNameCell.style.whiteSpace = "nowrap";
                techNameCell.style.overflow = "hidden";
                techNameCell.style.textOverflow = "ellipsis";
            }
            techNameCell.textContent = tech.full_name;
            techRow.appendChild(techNameCell);

            const techTimelineCell = document.createElement("div");
            techTimelineCell.className = "timeline-cell";
            techTimelineCell.style.width = "80%";
            techTimelineCell.style.position = "relative";
            $(techTimelineCell).on("click", function(e) {
                if ($(e.target).closest(".schedule-event").length === 0) {
                    createEvent(e, techTimelineCell, technician_id);
                }
            });
            techTimelineCell.addEventListener("dragover", function(e) { e.preventDefault(); });
            techTimelineCell.addEventListener("drop", function(e) {
                e.preventDefault();
                dropEvent(e, techTimelineCell);
            });
            appointments.forEach(app => {
                if (app.service_technicians && app.service_technicians.indexOf(technician_id) !== -1) {
                    const eventEl = createGanttEvent(app, technician_id);
                    techTimelineCell.appendChild(eventEl);
                }
            });
            techRow.appendChild(techTimelineCell);
            techRowsContainer.appendChild(techRow);
        });
        gridContainer.appendChild(techRowsContainer);

        // --- Timeline Background ---
        const timelineBackground = document.createElement("div");
        timelineBackground.className = "timeline-background";
        timelineBackground.style.position = "absolute";
        timelineBackground.style.left = "20%";
        timelineBackground.style.top = "15px";
        timelineBackground.style.width = "80%";
        timelineBackground.style.bottom = "0";
        timelineBackground.style.pointerEvents = "none";
        for (let m = 0; m <= TOTAL_WORKING_MINUTES; m += 10) {
            const leftPercent = (m / TOTAL_WORKING_MINUTES) * 100;
            const lineDiv = document.createElement("div");
            lineDiv.style.position = "absolute";
            lineDiv.style.top = "0";
            lineDiv.style.bottom = "0";
            lineDiv.style.left = leftPercent + "%";
            if (m % 60 === 0) {
                lineDiv.style.width = "2px";
                lineDiv.style.background = "#aaa";
            } else {
                lineDiv.style.width = "1px";
                lineDiv.style.background = "#ddd";
            }
            timelineBackground.appendChild(lineDiv);
        }
        gridContainer.appendChild(timelineBackground);

        const scheduleGrid = document.getElementById("schedule-grid");
        scheduleGrid.innerHTML = "";
        scheduleGrid.appendChild(gridContainer);

        $("#technician-search").off("keyup").on("keyup", debounce(function () {
            const value = $(this).val().toLowerCase();
            $(".technician-row").not(".header-row").each(function () {
                $(this).toggle($(this).text().toLowerCase().includes(value));
            });
        }, 300));
    }

    // --- Event Element Creation & Handlers ---
    function createGanttEvent(app, technician) {
        const startMins = timeStringToMinutes(app.start_time);
        const endMins = timeStringToMinutes(app.finish_time);
        const pos = calculatePosition(startMins, endMins);
        const eventEl = document.createElement("div");
        eventEl.className = "schedule-event";
        eventEl.style.left = pos.leftPercent + "%";
        eventEl.style.width = pos.widthPercent + "%";
        eventEl.style.backgroundColor = app.color || STATUS_COLORS[(app.status || "").toLowerCase()] || "#007bff";
        eventEl.textContent = `${app.service_order} (${app.start_time} - ${app.finish_time})`;

        // Save data as both jQuery data and DOM attributes
        $(eventEl).data("appointment", app.name);
        eventEl.setAttribute("data-appointment", app.name);
        $(eventEl).data("tech", technician);
        eventEl.setAttribute("data-tech", technician);
        $(eventEl).data("start", app.start_time);
        eventEl.setAttribute("data-start", app.start_time);
        $(eventEl).data("end", app.finish_time);
        eventEl.setAttribute("data-end", app.finish_time);
        $(eventEl).data("service_order", app.service_order);
        eventEl.setAttribute("data-service-order", app.service_order);
        $(eventEl).data("status", app.status);
        eventEl.setAttribute("data-status", app.status);
        $(eventEl).data("color", app.color);
        eventEl.setAttribute("data-color", app.color);

        const statusLower = (app.status || "").toLowerCase();
        if (statusLower === "open" || statusLower === "scheduled") {
            eventEl.setAttribute("draggable", true);
            eventEl.addEventListener("dragstart", drag);
            eventEl.addEventListener("dragend", dragEnd);
            attachResizeHandles(eventEl);
        } else {
            eventEl.setAttribute("draggable", false);
        }

        eventEl.addEventListener("click", function(e) {
            e.stopPropagation();
            editEvent(eventEl);
        });

        return eventEl;
    }

    function createEvent(e, timelineCell, technician) {
        const timelineOffset = $(timelineCell).offset();
        let clickX = e.pageX - timelineOffset.left;
        const timelineWidth = $(timelineCell).width();
        let minutesFromStart = (clickX / timelineWidth) * TOTAL_WORKING_MINUTES;
        minutesFromStart = roundToNearestTen(minutesFromStart);
        const eventStartMinutes = START_TIME_MINUTES + minutesFromStart;
        const eventEndMinutes = eventStartMinutes + 30;
        const selectedDate = currentSelectedDate;

        const d = new frappe.ui.Dialog({
            title: "Create Schedule",
            fields: [
                { fieldname: 'service_order', fieldtype: 'Link', options: 'Service Order', label: 'Service Order', reqd: 1,
                  get_query: () => { return { filters: { status: "Open" } }; }
                },
                { fieldname: 'technician', fieldtype: 'Link', options: 'Service Technician', label: 'Technician', default: technician, read_only: 1 },
                { fieldtype: 'Column Break' },
                { fieldname: 'selected_date', fieldtype: 'Date', label: 'Selected Date', default: selectedDate, read_only: 1 },
                { fieldname: 'start_time', fieldtype: 'Time', label: 'Start Time', default: minutesToTimeString(eventStartMinutes), reqd: 1 },
                { fieldname: 'finish_time', fieldtype: 'Time', label: 'Finish Time', default: minutesToTimeString(eventEndMinutes), reqd: 1 }
            ],
            primary_action_label: "Schedule",
            primary_action: function(values) {
                let st = values.start_time.trim();
                let ft = values.finish_time.trim();
                const startMins = timeStringToMinutes(st);
                const endMins = timeStringToMinutes(ft);
                if (startMins >= endMins || startMins < START_TIME_MINUTES || endMins > END_TIME_MINUTES) {
                    frappe.msgprint("Invalid time range. Please select a valid range between 07:00 - 19:00.");
                    return;
                }
                if ((endMins - startMins) < 30) {
                    frappe.msgprint("Time range must be at least 30 minutes.");
                    return;
                }
                const scheduledStart = formatDatetime(values.selected_date, st);
                const scheduledFinish = formatDatetime(values.selected_date, ft);
                create_appointment(values.selected_date, values.service_order, scheduledStart, scheduledFinish, technician, false, function(appointment_data) {
                    frappe.msgprint("Appointment created for " + values.service_order);
                    refreshGantt();
                });
                d.hide();
            },
            secondary_action_label: "Schedule and Dispatch",
            secondary_action: function() {
                var values = d.get_values();
                if(!values.start_time || !values.finish_time) {
                    frappe.msgprint("Please fill in start and finish time.");
                    return;
                }
                let st = values.start_time.trim();
                let ft = values.finish_time.trim();
                const startMins = timeStringToMinutes(st);
                const endMins = timeStringToMinutes(ft);
                if (startMins >= endMins || startMins < START_TIME_MINUTES || endMins > END_TIME_MINUTES) {
                    frappe.msgprint("Invalid time range. Please select a valid range between 07:00 - 19:00.");
                    return;
                }
                if ((endMins - startMins) < 30) {
                    frappe.msgprint("Time range must be at least 30 minutes.");
                    return;
                }
                const scheduledStart = formatDatetime(values.selected_date, st);
                const scheduledFinish = formatDatetime(values.selected_date, ft);
                create_appointment(values.selected_date, values.service_order, scheduledStart, scheduledFinish, technician, true, function(appointment_data) {
                    frappe.msgprint("Appointment created and dispatched for " + values.service_order);
                    refreshGantt();
                });
                d.hide();
            }
        });
        d.show();
    }

    function editEvent(eventEl) {
        const appointmentId = $(eventEl).data("appointment");
        const service_order = $(eventEl).data("service_order");
        const start_time = $(eventEl).data("start");
        const finish_time = $(eventEl).data("end");
        const technician = $(eventEl).data("tech");
        const selectedDate = currentSelectedDate;

        const d = new frappe.ui.Dialog({
            title: "Edit Schedule",
            fields: [
                { fieldname: 'appointment', fieldtype: 'Link', options: 'Service Appointment', label: 'Appointment', default: appointmentId, read_only: 1 },
                { fieldname: 'service_order', fieldtype: 'Link', options: 'Service Order', label: 'Service Order', default: service_order, read_only: 1 },
                { fieldname: 'technician', fieldtype: 'Link', options: 'Service Technician', label: 'Technician', default: technician, read_only: 1 },
                { fieldtype: 'Column Break' },
                { fieldname: 'selected_date', fieldtype: 'Date', label: 'Selected Date', default: selectedDate, read_only: 1 },
                { fieldname: 'start_time', fieldtype: 'Time', label: 'Start Time', default: start_time, reqd: 1 },
                { fieldname: 'finish_time', fieldtype: 'Time', label: 'Finish Time', default: finish_time, reqd: 1 }
            ],
            primary_action_label: "Update",
            primary_action: function(values) {
                const newStart = timeStringToMinutes(values.start_time.trim());
                const newEnd = timeStringToMinutes(values.finish_time.trim());
                if (newStart >= newEnd || newStart < START_TIME_MINUTES || newEnd > END_TIME_MINUTES) {
                    frappe.msgprint("Invalid time range. Please select a valid range between 07:00 - 19:00.");
                    return;
                }
                if ((newEnd - newStart) < 30) {
                    frappe.msgprint("Time range must be at least 30 minutes.");
                    return;
                }
                const pos = calculatePosition(newStart, newEnd);
                $(eventEl).css({
                    left: pos.leftPercent + "%",
                    width: pos.widthPercent + "%"
                });
                $(eventEl).data("start", values.start_time.trim());
                $(eventEl).data("end", values.finish_time.trim());
                $(eventEl).text(`${service_order} (${values.start_time.trim()} - ${values.finish_time.trim()})`);
                const scheduledStart = formatDatetime(values.selected_date, values.start_time.trim());
                const scheduledFinish = formatDatetime(values.selected_date, values.finish_time.trim());
                update_appointment(values.appointment, values.selected_date, service_order, scheduledStart, scheduledFinish, technician);
                d.hide();
            }
        });
        d.show();
    }

    // --- Drag & Drop Handlers ---
    function drag(e) {
        const status = $(e.target).data("status") || "";
        if (status.toLowerCase() !== "open" && status.toLowerCase() !== "scheduled") {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData("text/plain", e.target.outerHTML);
        e.target.classList.add("dragging");
    }

    function dragEnd(e) {
        e.target.classList.remove("dragging");
    }

    function dropEvent(e, timelineCell) {
        const draggedHTML = e.dataTransfer.getData("text/plain");
        const $dragged = $(draggedHTML);
        const oldStart = timeStringToMinutes($dragged.attr("data-start"));
        const oldEnd = timeStringToMinutes($dragged.attr("data-end"));
        const duration = oldEnd - oldStart;
        const timelineOffset = $(timelineCell).offset();
        const dropX = e.pageX - timelineOffset.left;
        const timelineWidth = $(timelineCell).width();
        let minutesFromStart = (dropX / timelineWidth) * TOTAL_WORKING_MINUTES;
        minutesFromStart = roundToNearestTen(minutesFromStart);
        let newStartMins = START_TIME_MINUTES + minutesFromStart;
        let newEndMins = newStartMins + duration;
        if (newStartMins < START_TIME_MINUTES) {
            newStartMins = START_TIME_MINUTES;
            newEndMins = newStartMins + duration;
        }
        if (newEndMins > END_TIME_MINUTES) {
            newStartMins = END_TIME_MINUTES - duration;
            newEndMins = END_TIME_MINUTES;
        }
        $(".schedule-event").filter(function() {
            return $(this).attr("data-appointment") === $dragged.attr("data-appointment");
        }).remove();
        const pos = calculatePosition(newStartMins, newEndMins);
        const eventColor = $dragged.attr("data-color") || STATUS_COLORS[$dragged.attr("data-status").toLowerCase()] || "#007bff";
        const newStartTime = minutesToTimeString(newStartMins);
        const newEndTime = minutesToTimeString(newEndMins);
        const appointment = $dragged.attr("data-appointment");
        const service_order = $dragged.attr("data-service-order");
        // Get new technician from the drop target's row
        const newTech = $(timelineCell).closest(".technician-row").attr("data-tech") || $dragged.attr("data-tech");
        const eventHTML = `<div class="schedule-event" draggable="true" data-appointment="${appointment}" data-tech="${newTech}" data-start="${newStartTime}" data-end="${newEndTime}" data-service-order="${service_order}" data-status="${$dragged.attr("data-status")}" data-color="${eventColor}">${service_order} (${newStartTime} - ${newEndTime})</div>`;
        const $newEvent = $(eventHTML);
        $newEvent.css({
            left: pos.leftPercent + "%",
            width: pos.widthPercent + "%"
        });
        $(timelineCell).append($newEvent);
        const selectedDate = currentSelectedDate;
        const scheduledStart = formatDatetime(selectedDate, newStartTime);
        const scheduledFinish = formatDatetime(selectedDate, newEndTime);
        update_appointment(appointment, selectedDate, service_order, scheduledStart, scheduledFinish, newTech);
        setTimeout(refreshGantt, 300);
    }

    // --- Resizing Handlers ---
    function startResizing(e, eventEl, side) {
        e.stopPropagation();
        const initialX = e.pageX;
        const initialStart = timeStringToMinutes($(eventEl).data("start"));
        const initialEnd = timeStringToMinutes($(eventEl).data("end"));
        $(eventEl).attr("draggable", false);
        const onMouseMove = function(e) {
            const delta = e.pageX - initialX;
            const timelineWidth = $(eventEl).parent().width();
            const deltaMins = (delta / timelineWidth) * TOTAL_WORKING_MINUTES;
            if (side === "left") {
                let newStart = initialStart + deltaMins;
                if (newStart < START_TIME_MINUTES) newStart = START_TIME_MINUTES;
                if (newStart >= initialEnd - 30) newStart = initialEnd - 30;
                $(eventEl).data("start", minutesToTimeString(newStart));
                const pos = calculatePosition(newStart, initialEnd);
                $(eventEl).css({ left: pos.leftPercent + "%", width: pos.widthPercent + "%" });
            } else if (side === "right") {
                let newEnd = initialEnd + deltaMins;
                if (newEnd > END_TIME_MINUTES) newEnd = END_TIME_MINUTES;
                if (newEnd <= initialStart + 30) newEnd = initialStart + 30;
                $(eventEl).data("end", minutesToTimeString(newEnd));
                const pos = calculatePosition(initialStart, newEnd);
                $(eventEl).css({ width: pos.widthPercent + "%" });
            }
        };
        const onMouseUp = function(e) {
            $(document).off("mousemove", onMouseMove);
            $(document).off("mouseup", onMouseUp);
            $(eventEl).attr("draggable", true);
            const newStartTime = $(eventEl).data("start");
            const newEndTime = $(eventEl).data("end");
            const pos = calculatePosition(timeStringToMinutes(newStartTime), timeStringToMinutes(newEndTime));
            $(eventEl).css({ left: pos.leftPercent + "%", width: pos.widthPercent + "%" });
            const selectedDate = currentSelectedDate;
            const scheduledStart = formatDatetime(selectedDate, newStartTime);
            const scheduledFinish = formatDatetime(selectedDate, newEndTime);
            update_appointment($(eventEl).data("appointment"), selectedDate, $(eventEl).data("service_order"), scheduledStart, scheduledFinish, $(eventEl).data("tech"));
            setTimeout(refreshGantt, 300);
        };
        $(document).on("mousemove", onMouseMove);
        $(document).on("mouseup", onMouseUp);
    }

    function attachResizeHandles(eventEl) {
        if ($(eventEl).find(".resize-handle").length === 0) {
            $(eventEl).append('<div class="resize-handle left-handle"></div>');
            $(eventEl).append('<div class="resize-handle right-handle"></div>');
        }
        $(eventEl).find(".left-handle").on("mousedown", function(e) {
            startResizing(e, eventEl, "left");
        });
        $(eventEl).find(".right-handle").on("mousedown", function(e) {
            startResizing(e, eventEl, "right");
        });
    }

    // --- Refresh & Data Loading with Loader ---
    function loadSchedule(selected_date) {
        currentSelectedDate = selected_date;
        frappe.call({
            method: "starrain_fsm.field_service_management.page.dispatch.dispatch.get_schedule_data",
            args: { selected_date: selected_date, all_dates: false },
            no_cache: 1,
            callback: function(r) {
                if (r.message) {
                    renderDateTable(selected_date);
                    // Filter appointments to show only those with posting_date equal to selected_date
                    let appointments = r.message.appointments || [];
                    let filteredAppointments = appointments.filter(app => app.posting_date === selected_date);
                    renderScheduleGrid(r.message.technicians, selected_date, filteredAppointments);
                } else if (r.exc) {
                    frappe.msgprint("An error occurred while loading the schedule.");
                }
            }
        });
    }

    function refreshGantt() {
        const container = document.querySelector("#gantt-page-body");
        if (!container) return;
        container.innerHTML = `<div class="text-center" style="padding: 20px;"><div class="spinner-border text-muted"></div></div>`;
        setTimeout(function() {
            container.innerHTML = "";
            renderGanttUI(container);
            loadSchedule(currentSelectedDate);
            attachGanttEventHandlers();
        }, 300);
    }

    // --- Event Handlers for Date Navigation & Search ---
    function attachGanttEventHandlers() {
        document.getElementById("today-btn").addEventListener("click", function() {
            const selected_date = frappe.datetime.get_today();
            currentSelectedDate = selected_date;
            loadSchedule(selected_date);
        });
        document.getElementById("tomorrow-btn").addEventListener("click", function() {
            const selected_date = frappe.datetime.add_days(frappe.datetime.get_today(), 1);
            currentSelectedDate = selected_date;
            loadSchedule(selected_date);
        });
        document.getElementById("select-date-btn").addEventListener("click", function() {
            let d = new frappe.ui.Dialog({
                title: "Select Date",
                fields: [
                    { fieldname: "selected_date", fieldtype: "Date", label: "Date", default: currentSelectedDate }
                ],
                primary_action_label: "Go",
                primary_action: function(values) {
                    currentSelectedDate = values.selected_date;
                    loadSchedule(values.selected_date);
                    d.hide();
                }
            });
            d.show();
        });
    }

    window.filter_by_date = function(date) {
        document.querySelectorAll(".date-header").forEach(function(th) {
            th.classList.remove("selected-date");
        });
        const selectedTh = document.querySelector(`.date-header[data-date='${date}']`);
        if (selectedTh) selectedTh.classList.add("selected-date");
        currentSelectedDate = date;
        loadSchedule(date);
    };

    // --- Main Initializer ---
    function initGantt(containerSelector) {
        const container = document.querySelector(containerSelector);
        if (!container) {
            console.error("Gantt container not found:", containerSelector);
            return;
        }
        renderGanttUI(container);
        loadSchedule(currentSelectedDate);
        attachGanttEventHandlers();
    }

    // Expose init_gantt globally so that dispatch.js can call it.
    window.init_gantt = initGantt;
})();
