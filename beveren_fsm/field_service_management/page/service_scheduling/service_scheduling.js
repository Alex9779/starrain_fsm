// Global constants and variables
const START_TIME_MINUTES = 420; // 07:00 in minutes
const END_TIME_MINUTES = 1140; // 19:00 in minutes
const TOTAL_WORKING_MINUTES = END_TIME_MINUTES - START_TIME_MINUTES; // 720 minutes

var status_colors = {
  Scheduled: "#007bff",
  Rescheduled: "#28a745",
  Completed: "#6c757d",
  Cancelled: "#dc3545",
};

let isResizing = false;
let justResized = false;
let currentSelectedDate = frappe.datetime.get_today();

// Mobile detection and date range helpers
function isMobile() {
  return window.innerWidth < 768;
}

function generate_date_range(selected_date) {
  let dates = [];
  if (isMobile()) {
    // Show 5 days: 2 before, current, 2 after.
    for (let i = -2; i <= 2; i++) {
      dates.push(frappe.datetime.add_days(selected_date, i));
    }
  } else {
    // Default range: from -10 to +9 days (20 days)
    let today_index = 10;
    for (let i = -today_index; i <= 20 - today_index - 1; i++) {
      dates.push(frappe.datetime.add_days(selected_date, i));
    }
  }
  return dates;
}

function openDatePicker() {
  let d = new frappe.ui.Dialog({
    title: "Select Date",
    fields: [
      {
        fieldname: "selected_date",
        fieldtype: "Date",
        label: "Date",
        default: currentSelectedDate,
      },
    ],
    primary_action_label: "Go",
    primary_action: (values) => {
      currentSelectedDate = values.selected_date;
      load_schedule(values.selected_date);
      d.hide();
    },
  });
  d.show();
}

// Helper functions
const timeStringToMinutes = (timeStr) => {
  const parts = timeStr.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
};

const minutesToTimeString = (minutes) => {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return ("0" + hrs).slice(-2) + ":" + ("0" + mins).slice(-2);
};

const roundToNearestTen = (mins) => Math.round(mins / 10) * 10;

const formatDatetime = (date, timeStr) => {
  const parts = timeStr.split(":");
  if (parts.length === 2) {
    return date + " " + timeStr + ":00";
  }
  return date + " " + timeStr;
};

const calculatePosition = (startMins, endMins) => {
  const leftPercent =
    ((startMins - START_TIME_MINUTES) / TOTAL_WORKING_MINUTES) * 100;
  const widthPercent = ((endMins - startMins) / TOTAL_WORKING_MINUTES) * 100;
  return { leftPercent, widthPercent };
};

const debounce = (func, delay) => {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
};

// Transform a service order number.
// For example, "SVC-APP-2025-00043" becomes "ORD-00043".
function transformServiceOrder(order) {
  if (!order) return "";
  let parts = order.split("-");
  if (parts.length >= 1) {
    return "ORD-" + parts[parts.length - 1];
  }
  return order;
}

// Consolidated drag & drop functions
function drag(event) {
  event.dataTransfer.setData("text", event.target.outerHTML);
  event.target.classList.add("dragging");
}

function dragEnd(event) {
  event.target.classList.remove("dragging");
}

const allowDrop = (event) => {
  event.preventDefault();
};

function is_overlapping(technician, startMins, endMins) {
  let overlapping = false;
  $(`.technician-row[data-tech='${technician}'] .schedule-event`).each(
    function () {
      const eventStart = timeStringToMinutes($(this).attr("data-start"));
      const eventEnd = timeStringToMinutes($(this).attr("data-end"));
      if (startMins < eventEnd && endMins > eventStart) {
        overlapping = true;
        return false;
      }
    }
  );
  return overlapping;
}

function is_overlapping_excluding(technician, startMins, endMins, excludeId) {
  let overlapping = false;
  $(`.technician-row[data-tech='${technician}'] .schedule-event`).each(
    function () {
      if ($(this).data("appointment") == excludeId) return;
      const eventStart = timeStringToMinutes($(this).attr("data-start"));
      const eventEnd = timeStringToMinutes($(this).attr("data-end"));
      if (startMins < eventEnd && endMins > eventStart) {
        overlapping = true;
        return false;
      }
    }
  );
  return overlapping;
}

// Page load initialization
frappe.pages["service-scheduling"].on_page_load = function (wrapper) {
  let page = frappe.ui.make_app_page({
    parent: wrapper,
    single_column: true,
  });

  // Breadcrumbs
  $(
    '<div class="breadcrumbs" style="font-size: 14px; margin-bottom: 5px;"><a style="color:blue; text-decoration:none;" href="/app/beveren-fsm">HOME</a> > <strong>Schedule & Dispatch</strong></div>'
  ).appendTo(page.body);

  // Header controls with "Select Date" button (using calendar icon)
  let header_controls = $(`
		<div class="d-flex justify-content-between align-items-center mb-2">
			<h3 id="month-header"></h3>
			<div>
				<button class="btn btn-sm btn-secondary mr-2" id="select-date-btn"><i class="fa fa-calendar"></i></button>
				<button class="btn btn-sm btn-primary mr-2" id="today-btn">Today</button>
				<button class="btn btn-sm btn-secondary mr-2" id="tomorrow-btn">Tomorrow</button>
			</div>
		</div>
	`).appendTo(page.body);

  $("#select-date-btn").on("click", () => {
    openDatePicker();
  });

  let month_row = $(
    `<div id="month-row" class="text-center font-weight-bold mb-1"></div>`
  ).appendTo(page.body);
  let date_table = $(`<div id="date-table"></div>`).appendTo(page.body);

  // The merged header (with search and time labels) will be built in render_schedule_grid.
  let schedule_grid = $(`<div id="schedule-grid"></div>`);
  // For mobile, allow horizontal scrolling.
  if (isMobile()) {
    schedule_grid.css("overflow-x", "auto");
  }
  schedule_grid.appendTo(page.body);

  currentSelectedDate = frappe.datetime.get_today();
  load_schedule(currentSelectedDate);

  $("#today-btn").on("click", () => {
    const selected_date = frappe.datetime.get_today();
    currentSelectedDate = selected_date;
    load_schedule(selected_date);
  });

  $("#tomorrow-btn").on("click", () => {
    const selected_date = frappe.datetime.add_days(
      frappe.datetime.get_today(),
      1
    );
    currentSelectedDate = selected_date;
    load_schedule(selected_date);
  });
};

// Event resizing functions
function startResizing(e, eventElement, side) {
  e.stopPropagation();
  isResizing = true;
  $(eventElement).attr("draggable", false);
  const initialX = e.pageX;
  const initialStart = timeStringToMinutes($(eventElement).data("start"));
  const initialEnd = timeStringToMinutes($(eventElement).data("end"));

  const onMouseMove = (e) => {
    const delta = e.pageX - initialX;
    const timelineWidth = $(eventElement).parent().width();
    const deltaMins = (delta / timelineWidth) * TOTAL_WORKING_MINUTES;
    if (side === "left") {
      let newStart = initialStart + deltaMins;
      if (newStart < START_TIME_MINUTES) newStart = START_TIME_MINUTES;
      if (newStart >= initialEnd - 30) newStart = initialEnd - 30;
      $(eventElement).attr("data-start", minutesToTimeString(newStart));
      const pos = calculatePosition(newStart, initialEnd);
      $(eventElement).css({
        left: pos.leftPercent + "%",
        width: pos.widthPercent + "%",
      });
    } else if (side === "right") {
      let newEnd = initialEnd + deltaMins;
      if (newEnd > END_TIME_MINUTES) newEnd = END_TIME_MINUTES;
      if (newEnd <= initialStart + 30) newEnd = initialStart + 30;
      $(eventElement).attr("data-end", minutesToTimeString(newEnd));
      const pos = calculatePosition(initialStart, newEnd);
      $(eventElement).css({ width: pos.widthPercent + "%" });
    }
  };

  const onMouseUp = (e) => {
    $(document).off("mousemove", onMouseMove);
    $(document).off("mouseup", onMouseUp);
    $(eventElement).attr("draggable", true);
    isResizing = false;
    justResized = true;
    setTimeout(() => {
      justResized = false;
    }, 300);

    const newStartStr = $(eventElement).attr("data-start");
    const newEndStr = $(eventElement).attr("data-end");
    if (!newStartStr || !newEndStr) {
      frappe.msgprint("Error reading time data after resizing.");
      return;
    }
    const newStart = timeStringToMinutes(newStartStr);
    const newEnd = timeStringToMinutes(newEndStr);
    const technician = $(eventElement).data("tech");
    const appointmentId = $(eventElement).data("appointment");
    if (is_overlapping_excluding(technician, newStart, newEnd, appointmentId)) {
      frappe.msgprint(
        "Time overlap detected during resizing. Reverting changes."
      );
      $(eventElement).attr("data-start", minutesToTimeString(initialStart));
      $(eventElement).attr("data-end", minutesToTimeString(initialEnd));
      const pos = calculatePosition(initialStart, initialEnd);
      $(eventElement).css({
        left: pos.leftPercent + "%",
        width: pos.widthPercent + "%",
      });
      return;
    }
    update_appointment(
      appointmentId,
      currentSelectedDate,
      $(eventElement).data("service-order"),
      formatDatetime(currentSelectedDate, minutesToTimeString(newStart)),
      formatDatetime(currentSelectedDate, minutesToTimeString(newEnd)),
      $(eventElement).data("tech")
    );
  };

  $(document).on("mousemove", onMouseMove);
  $(document).on("mouseup", onMouseUp);
}

function attachResizeHandles(eventElement) {
  if ($(eventElement).find(".resize-handle").length === 0) {
    $(eventElement).append('<div class="resize-handle left-handle"></div>');
    $(eventElement).append('<div class="resize-handle right-handle"></div>');
  }
  $(eventElement)
    .find(".left-handle")
    .on("mousedown", (e) => {
      startResizing(e, eventElement, "left");
    });
  $(eventElement)
    .find(".right-handle")
    .on("mousedown", (e) => {
      startResizing(e, eventElement, "right");
    });
}

// Create event function
function create_event(event, timelineCell) {
  if ($(event.target).hasClass("schedule-event") || isResizing || justResized)
    return;
  const technician = $(timelineCell).closest(".technician-row").data("tech");
  const timelineOffset = $(timelineCell).offset();
  const clickX = event.pageX - timelineOffset.left;
  const timelineWidth = $(timelineCell).width();
  let minutesFromStart = (clickX / timelineWidth) * TOTAL_WORKING_MINUTES;
  minutesFromStart = roundToNearestTen(minutesFromStart);
  const eventStartMinutes = START_TIME_MINUTES + minutesFromStart;
  const eventEndMinutes = eventStartMinutes + 30;
  const selectedDate = currentSelectedDate || frappe.datetime.get_today();

  const d = new frappe.ui.Dialog({
    title: "Create Schedule",
    fields: [
      {
        fieldname: "appointment",
        fieldtype: "Link",
        options: "Service Appointment",
        label: "Appointment",
        read_only: 1,
        default: "",
        hidden: 1,
      },
      {
        fieldname: "service_order",
        fieldtype: "Link",
        options: "Service Order",
        label: "Service Order",
        reqd: 1,
      },
      {
        fieldname: "technician",
        fieldtype: "Link",
        options: "Service Technician",
        label: "Technician",
        read_only: 1,
        default: technician,
      },
      { fieldtype: "Column Break" },
      {
        fieldname: "selected_date",
        fieldtype: "Date",
        label: "Selected Date",
        default: selectedDate,
        read_only: 1,
      },
      {
        fieldname: "start_time",
        fieldtype: "Time",
        label: "Start Time",
        default: minutesToTimeString(eventStartMinutes),
        reqd: 1,
      },
      {
        fieldname: "finish_time",
        fieldtype: "Time",
        label: "Finish Time",
        default: minutesToTimeString(eventEndMinutes),
        reqd: 1,
      },
    ],
    primary_action_label: "Schedule & Dispatch",
    primary_action: (values) => {
      const startMins = timeStringToMinutes(values.start_time);
      const endMins = timeStringToMinutes(values.finish_time);
      if (
        startMins >= endMins ||
        startMins < START_TIME_MINUTES ||
        endMins > END_TIME_MINUTES
      ) {
        frappe.msgprint(
          "Invalid time range. Select a valid start and finish time between 07:00 - 19:00."
        );
        return;
      }
      if (endMins - startMins < 30) {
        frappe.msgprint("Time range must be at least 30 minutes.");
        return;
      }
      if (is_overlapping(technician, startMins, endMins)) {
        frappe.msgprint(
          "Time overlap detected! Please select a different time."
        );
        return;
      }
      const scheduledStartDatetime = formatDatetime(
        values.selected_date,
        values.start_time
      );
      const scheduledFinishDatetime = formatDatetime(
        values.selected_date,
        values.finish_time
      );
      create_appointment(
        values.selected_date,
        values.service_order,
        scheduledStartDatetime,
        scheduledFinishDatetime,
        technician,
        (appointment_data) => {
          const appointment_id = appointment_data.name;
          const appointment_status = appointment_data.status || "Dispatched";
          const event_color =
            appointment_data.color ||
            status_colors[appointment_status] ||
            "#007bff";
          const duration = endMins - startMins;
          const pos = calculatePosition(startMins, endMins);
          const $eventEl = $(`
						<div class="schedule-event" draggable="true" ondragstart="drag(event)" ondragend="dragEnd(event)" onclick="edit_event(this)"
							data-appointment="${appointment_id}" data-tech="${technician}" data-start="${
            values.start_time
          }" data-end="${values.finish_time}"
							data-service-order="${
                values.service_order
              }" data-status="${appointment_status}" data-color="${
            appointment_data.color
          }">
							${transformServiceOrder(values.service_order)} (${values.start_time} - ${
            values.finish_time
          })
						</div>
					`);
          $eventEl.css({
            background: event_color,
            left: pos.leftPercent + "%",
            width: pos.widthPercent + "%",
          });
          $(timelineCell).append($eventEl);
          attachResizeHandles($eventEl);
          d.set_value("appointment", appointment_id);
          d.hide();
        }
      );
    },
  });
  d.show();
}

// Render schedule grid
function render_schedule_grid(technicians, selected_date, appointments) {
  const gridContainer = $(`
		<div class="schedule-grid-container" style="position: relative; width: 100%;"></div>
	`);

  // Create a merged header row with search input and bold time labels.
  const headerRow = $(`
		<div class="technician-row header-row" style="display: flex; height: 40px; border-bottom: 1px solid #ddd;">
			<div class="technician-name" style="width: 20%; background: #f0f0f0; text-align: center; line-height: 40px; border-right: 1px solid #ddd; font-size: ${
        isMobile() ? "10px" : "12px"
      };">
				<input type="text" id="technician-search" class="form-control form-control-sm" placeholder="Search Technician" style="height: 100%; border: none; outline: none; box-shadow: none; border-radius: 0;"/>
			</div>
			<div class="timeline-cell" style="width: 80%; position: relative;">
			</div>
		</div>
	`);
  // Insert bold time labels inside the timeline-cell; on mobile display only the hour (e.g., "7") with a smaller font.
  for (let m = 0; m < TOTAL_WORKING_MINUTES; m += 60) {
    const rawTime = minutesToTimeString(START_TIME_MINUTES + m);
    const displayTime = isMobile() ? parseInt(rawTime.split(":")[0]) : rawTime;
    const leftPercent = (m / TOTAL_WORKING_MINUTES) * 100;
    const labelDiv = $(`
			<div class="time-label" style="position: absolute; left: ${leftPercent}%; transform: translateX(-50%); font-size: ${
      isMobile() ? "10px" : "12px"
    }; color: #555; font-weight: bold;">
				${displayTime}
			</div>
		`);
    headerRow.find(".timeline-cell").append(labelDiv);
  }
  gridContainer.append(headerRow);

  // Separator: horizontal line spanning full width.
  const separator = $(`
		<div class="separator" style="width: 100%; border-top: 1px solid #ddd; margin: 0; padding: 0;"></div>
	`);
  gridContainer.append(separator);

  // Technician rows container.
  const techRowsContainer = $(`<div class="technician-rows"></div>`);
  technicians.forEach((tech) => {
    const techRow = $(`
			<div class="technician-row" data-tech="${
        tech.name
      }" style="display: flex; height: 33px; border-bottom: 1px solid #ddd;">
				<div class="technician-name" style="width: 20%; background: #f0f0f0; text-align: center; line-height: 33px; border-right: 1px solid #ddd; font-size: ${
          isMobile() ? "10px" : "12px"
        }; ${
      isMobile()
        ? "white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
        : ""
    }">
					${tech.full_name}
				</div>
				<div class="timeline-cell" style="width: 80%; position: relative;" onclick="create_event(event, this)" ondrop="drop(event, this)" ondragover="allowDrop(event)"></div>
			</div>
		`);
    techRowsContainer.append(techRow);
  });
  gridContainer.append(techRowsContainer);
  $("#schedule-grid").html(gridContainer);

  // Timeline background: vertical grid lines now start below the header row.
  const timelineBackground = $(`
		<div class="timeline-background" style="position: absolute; left: 20%; top: 15px; width: 80%; bottom: 0; pointer-events: none;"></div>
	`);
  for (let m = 0; m <= TOTAL_WORKING_MINUTES; m += 10) {
    const leftPercent = (m / TOTAL_WORKING_MINUTES) * 100;
    const lineWidth = m % 60 === 0 ? 2 : 1;
    const lineColor = m % 60 === 0 ? "#aaa" : "#ddd";
    const lineDiv = $(`
			<div style="position: absolute; top: 0; bottom: 0; left: ${leftPercent}%; width: ${lineWidth}px; background: ${lineColor};"></div>
		`);
    timelineBackground.append(lineDiv);
  }
  gridContainer.append(timelineBackground);

  // Filter technician rows but exclude the header row so that the search input stays visible.
  $("#technician-search")
    .off("keyup")
    .on(
      "keyup",
      debounce(function () {
        const value = $(this).val().toLowerCase();
        $(".technician-row")
          .not(".header-row")
          .filter(function () {
            $(this).toggle($(this).text().toLowerCase().includes(value));
          });
      }, 300)
    );

  appointments.forEach((appointment) => {
    appointment.service_technicians.forEach((technicianName) => {
      technicianName = technicianName.trim();
      const $techRow = $(`.technician-row[data-tech='${technicianName}']`);
      if ($techRow.length === 0) return;
      const timelineCell = $techRow.find(".timeline-cell");
      const startMins = timeStringToMinutes(appointment.start_time);
      const endMins = timeStringToMinutes(appointment.finish_time);
      const pos = calculatePosition(startMins, endMins);
      const appointment_status = appointment.status || "Dispatched";
      const event_color =
        appointment.color || status_colors[appointment_status] || "#007bff";
      const $ev = $(`
				<div class="schedule-event" draggable="true" ondragstart="drag(event)" ondragend="dragEnd(event)" onclick="edit_event(this)"
					data-appointment="${
            appointment.name
          }" data-tech="${technicianName}" data-start="${
        appointment.start_time
      }"
					data-end="${appointment.finish_time}" data-service-order="${
        appointment.service_order
      }" data-status="${appointment_status}" data-color="${appointment.color}">
					${transformServiceOrder(appointment.service_order)} (${
        appointment.start_time
      } - ${appointment.finish_time})
				</div>
			`);
      $ev.css({
        background: event_color,
        left: pos.leftPercent + "%",
        width: pos.widthPercent + "%",
      });
      timelineCell.append($ev);
      attachResizeHandles($ev);
    });
  });
}

// Edit event dialog
function edit_event(eventElement) {
  if (justResized) return;
  const appointmentId = $(eventElement).data("appointment");
  const service_order = $(eventElement).data("service-order");
  const start_time = $(eventElement).attr("data-start");
  const finish_time = $(eventElement).attr("data-end");
  const technician = $(eventElement).data("tech");
  const selectedDate = currentSelectedDate || frappe.datetime.get_today();
  const d = new frappe.ui.Dialog({
    title: "Edit Schedule",
    fields: [
      {
        fieldname: "appointment",
        fieldtype: "Link",
        options: "Service Appointment",
        label: "Appointment",
        default: appointmentId,
        read_only: 1,
      },
      {
        fieldname: "service_order",
        fieldtype: "Link",
        options: "Service Order",
        label: "Service Order",
        default: service_order,
        read_only: 1,
      },
      {
        fieldname: "technician",
        fieldtype: "Link",
        options: "Service Technician",
        label: "Technician",
        default: technician,
        read_only: 1,
      },
      { fieldtype: "Column Break" },
      {
        fieldname: "selected_date",
        fieldtype: "Date",
        label: "Selected Date",
        default: selectedDate,
        read_only: 1,
      },
      {
        fieldname: "start_time",
        fieldtype: "Time",
        label: "Start Time",
        default: start_time,
        reqd: 1,
      },
      {
        fieldname: "finish_time",
        fieldtype: "Time",
        label: "Finish Time",
        default: finish_time,
        reqd: 1,
      },
    ],
    primary_action_label: "Update",
    primary_action: (values) => {
      const newStart = timeStringToMinutes(values.start_time);
      const newEnd = timeStringToMinutes(values.finish_time);
      if (
        newStart >= newEnd ||
        newStart < START_TIME_MINUTES ||
        newEnd > END_TIME_MINUTES
      ) {
        frappe.msgprint(
          "Invalid time range. Select a valid start and finish time between 07:00 - 19:00."
        );
        return;
      }
      if (newEnd - newStart < 30) {
        frappe.msgprint("Time range must be at least 30 minutes.");
        return;
      }
      const pos = calculatePosition(newStart, newEnd);
      $(eventElement).css({
        left: pos.leftPercent + "%",
        width: pos.widthPercent + "%",
      });
      $(eventElement).attr("data-start", values.start_time);
      $(eventElement).attr("data-end", values.finish_time);
      $(eventElement).html(
        `${transformServiceOrder(values.service_order)} (${
          values.start_time
        } - ${values.finish_time})`
      );

      const scheduledStartDatetime = formatDatetime(
        values.selected_date,
        values.start_time
      );
      const scheduledFinishDatetime = formatDatetime(
        values.selected_date,
        values.finish_time
      );
      update_appointment(
        values.appointment,
        values.selected_date,
        values.service_order,
        scheduledStartDatetime,
        scheduledFinishDatetime,
        $(eventElement).data("tech")
      );
      d.hide();
    },
  });
  d.show();
}

// Drag & drop handler
function drop(event, timelineCell) {
  event.preventDefault();
  const draggedHtml = event.dataTransfer.getData("text");
  const draggedElement = $(draggedHtml);
  const oldStart = timeStringToMinutes(draggedElement.attr("data-start"));
  const oldEnd = timeStringToMinutes(draggedElement.attr("data-end"));
  const duration = oldEnd - oldStart;
  const timelineOffset = $(timelineCell).offset();
  const dropX = event.pageX - timelineOffset.left;
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
  const technician = $(timelineCell).closest(".technician-row").data("tech");
  if (
    is_overlapping_excluding(
      technician,
      newStartMins,
      newEndMins,
      draggedElement.data("appointment")
    )
  ) {
    frappe.msgprint(
      "Time overlap detected after drop! Please choose a different position."
    );
    return;
  }
  const serviceOrder = draggedElement.data("service-order");
  if (!serviceOrder) {
    frappe.msgprint("Service Order is required. Please create an event first.");
    return;
  }
  const newStartTime = minutesToTimeString(newStartMins);
  const newEndTime = minutesToTimeString(newEndMins);
  $(
    `.schedule-event[data-appointment='${draggedElement.data("appointment")}']`
  ).remove();
  const pos = calculatePosition(newStartMins, newEndMins);
  const event_color =
    draggedElement.data("color") ||
    status_colors[draggedElement.data("status")] ||
    "#007bff";
  const event_html = `
		<div class="schedule-event" draggable="true" ondragstart="drag(event)" ondragend="dragEnd(event)" onclick="edit_event(this)"
			data-appointment="${draggedElement.data(
        "appointment"
      )}" data-tech="${technician}" data-start="${newStartTime}" data-end="${newEndTime}"
			data-service-order="${serviceOrder}" data-status="${draggedElement.data(
    "status"
  )}" data-color="${event_color}">
			${transformServiceOrder(serviceOrder)} (${newStartTime} - ${newEndTime})
		</div>
	`;
  const $newEvent = $(event_html);
  $newEvent.css({
    background: event_color,
    left: pos.leftPercent + "%",
    width: pos.widthPercent + "%",
  });
  $(timelineCell).append($newEvent);
  const selectedDate = currentSelectedDate || frappe.datetime.get_today();
  const scheduledStartDatetime = formatDatetime(selectedDate, newStartTime);
  const scheduledFinishDatetime = formatDatetime(selectedDate, newEndTime);
  update_appointment(
    draggedElement.data("appointment"),
    selectedDate,
    serviceOrder,
    scheduledStartDatetime,
    scheduledFinishDatetime,
    technician
  );
}

// --- Context Menu ---
// For "Dispatched": show [Start Work, Invoice].
// For "Scheduled": show [Reschedule, Invoice].

// Desktop right-click context menu.
$(document).on("contextmenu", ".schedule-event", function (e) {
  var $this = $(this);
  var status = $this.data("status");
  if (status !== "Dispatched" && status !== "Scheduled") {
    return;
  }
  e.preventDefault();
  $("#custom-context-menu").remove();
  var appointmentId = $this.data("appointment");
  var menuItems = "";
  if (status === "Dispatched") {
    menuItems = `
			<div class="context-menu-item" data-action="start_work" style="padding: 5px 10px; cursor: pointer; border-bottom: 1px solid #eee;">Start Work</div>
			<div class="context-menu-item" data-action="invoice" style="padding: 5px 10px; cursor: pointer;">Invoice</div>
		`;
  } else if (status === "Scheduled") {
    menuItems = `
			<div class="context-menu-item" data-action="reschedule" style="padding: 5px 10px; cursor: pointer; border-bottom: 1px solid #eee;">Reschedule</div>
			<div class="context-menu-item" data-action="invoice" style="padding: 5px 10px; cursor: pointer;">Invoice</div>
		`;
  }
  var menu = $(`
		<div id="custom-context-menu" style="position: absolute; z-index: 10000; background: #fff; border: 1px solid #ccc; box-shadow: 2px 2px 5px rgba(0,0,0,0.2); font-family: sans-serif; font-size: 14px;">
			${menuItems}
		</div>
	`);
  menu.data("appointmentId", appointmentId);
  menu.data("eventElement", this);
  menu.css({ top: e.pageY + "px", left: e.pageX + "px" });
  $("body").append(menu);
});

$(document)
  .on("mouseenter", "#custom-context-menu .context-menu-item", function () {
    $(this).css("background", "#f5f5f5");
  })
  .on("mouseleave", "#custom-context-menu .context-menu-item", function () {
    $(this).css("background", "#fff");
  });

$(document).on("click", ".context-menu-item", function (e) {
  e.stopPropagation();
  var action = $(this).data("action");
  var appointmentId = $("#custom-context-menu").data("appointmentId");
  var eventElement = $("#custom-context-menu").data("eventElement");
  $("#custom-context-menu").remove();
  if (action === "start_work") {
    startWork(appointmentId);
  } else if (action === "reschedule") {
    edit_event(eventElement);
  } else if (action === "invoice") {
    invoiceAppointment(appointmentId);
  }
});

$(document).on("click", function (e) {
  $("#custom-context-menu").remove();
});

// Mobile long-press context menu.
var touchTimer;
$(document)
  .on("touchstart", ".schedule-event", function (e) {
    var $this = $(this);
    touchTimer = setTimeout(function () {
      var status = $this.data("status");
      if (status !== "Dispatched" && status !== "Scheduled") {
        return;
      }
      $("#custom-context-menu").remove();
      var appointmentId = $this.data("appointment");
      var touch = e.originalEvent.touches[0];
      var menuItems = "";
      if (status === "Dispatched") {
        menuItems = `
				<div class="context-menu-item" data-action="start_work" style="padding: 5px 10px; cursor: pointer; border-bottom: 1px solid #eee;">Start Work</div>
				<div class="context-menu-item" data-action="invoice" style="padding: 5px 10px; cursor: pointer;">Invoice</div>
			`;
      } else if (status === "Scheduled") {
        menuItems = `
				<div class="context-menu-item" data-action="reschedule" style="padding: 5px 10px; cursor: pointer; border-bottom: 1px solid #eee;">Reschedule</div>
				<div class="context-menu-item" data-action="invoice" style="padding: 5px 10px; cursor: pointer;">Invoice</div>
			`;
      }
      var menu = $(`
			<div id="custom-context-menu" style="position: absolute; z-index: 10000; background: #fff; border: 1px solid #ccc; box-shadow: 2px 2px 5px rgba(0,0,0,0.2); font-family: sans-serif; font-size: 14px;">
				${menuItems}
			</div>
		`);
      menu.data("appointmentId", appointmentId);
      menu.data("eventElement", $this.get(0));
      menu.css({ top: touch.pageY + "px", left: touch.pageX + "px" });
      $("body").append(menu);
    }, 800);
  })
  .on("touchend touchcancel", ".schedule-event", function (e) {
    clearTimeout(touchTimer);
  });

// Backend actions for context menu
function startWork(appointmentId) {
  frappe.call({
    method:
      "beveren_fsm.field_service_management.page.service_scheduling.service_scheduling.start_work",
    args: { appointment_id: appointmentId },
    callback: function (r) {
      if (!r.exc) {
        frappe.msgprint("Appointment started");
        refresh_schedule_grid(currentSelectedDate);
      }
    },
  });
}

function invoiceAppointment(appointmentId) {
  frappe.set_route("Form", "Service Appointment", appointmentId);
}

// Date table & refresh functions
function render_date_table(selected_date) {
  const dates = generate_date_range(selected_date);
  let table_html = `<table class="table table-bordered"><thead><tr>`;
  dates.forEach((date) => {
    const isSelected = date === selected_date ? "selected-date" : "";
    const monthName = new Date(date)
      .toLocaleString("en-us", { month: "short" })
      .toUpperCase();
    table_html += `<th class="date-header ${isSelected}" data-date="${date}" onclick="filter_by_date('${date}')">
							<div>${format_date(date)}</div>
							<div class="small" style="font-size: 8px;">${monthName}</div>
					   </th>`;
  });
  table_html += `</tr></thead></table>`;
  $("#date-table").html(table_html);
}

function filter_by_date(date) {
  $(".date-header").removeClass("selected-date");
  $(`.date-header[data-date='${date}']`).addClass("selected-date");
  currentSelectedDate = date;
  load_schedule(date);
}

function format_date(date) {
  const dateObj = new Date(date);
  const dayName = dateObj
    .toLocaleString("en-us", { weekday: "short" })
    .toUpperCase();
  const dayNum = dateObj.getDate();
  return `<div>${dayName}</div><div>${dayNum}</div>`;
}

function refresh_schedule_grid(selected_date) {
  $("#schedule-grid").html(`
		<div class="text-center" style="padding: 20px;">
			<div class="spinner-border text-muted"></div>
		</div>
	`);
  setTimeout(() => {
    load_schedule(selected_date);
  }, 100);
}

// Backend calls
function create_appointment(
  selected_date,
  service_order,
  scheduled_start_datetime,
  scheduled_finish_datetime,
  technician,
  callback
) {
  frappe.call({
    method:
      "beveren_fsm.field_service_management.page.service_scheduling.service_scheduling.create_service_appointment",
    args: {
      selected_date,
      service_order,
      scheduled_start_datetime,
      scheduled_finish_datetime,
      technician,
    },
    callback: (r) => {
      if (!r.exc) {
        if (callback) {
          callback(r.message);
        }
        refresh_schedule_grid(selected_date);
      } else {
        frappe.msgprint("Failed to update schedule.");
      }
    },
  });
}

function update_appointment(
  appointment_id,
  selected_date,
  service_order,
  start_time,
  end_time,
  technician
) {
  frappe.call({
    method:
      "beveren_fsm.field_service_management.page.service_scheduling.service_scheduling.update_service_appointment",
    args: {
      appointment_id,
      selected_date,
      service_order,
      scheduled_start_datetime: start_time,
      scheduled_finish_datetime: end_time,
      technician,
    },
    callback: (r) => {
      if (!r.exc) {
        refresh_schedule_grid(selected_date);
      }
    },
  });
}

function load_schedule(selected_date) {
  currentSelectedDate = selected_date;
  frappe.call({
    method:
      "beveren_fsm.field_service_management.page.service_scheduling.service_scheduling.get_schedule_data",
    args: { selected_date },
    callback: (r) => {
      if (r.message) {
        render_date_table(selected_date);
        render_schedule_grid(
          r.message.technicians,
          selected_date,
          r.message.appointments
        );
      } else if (r.exc) {
        console.error("Error fetching schedule data", r.exc);
        frappe.msgprint("An error occurred while loading the schedule.");
      }
    },
  });
}
