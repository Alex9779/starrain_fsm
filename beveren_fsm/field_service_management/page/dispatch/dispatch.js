frappe.pages["dispatch"].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({
    parent: wrapper,
    single_column: true,
  });

  $(wrapper).html(frappe.render_template("dispatch"));

  frappe.require(
    [
      "assets/beveren_fsm/js/dispatch/gantt.js",
      // Calendar file
      // Map file
    ],
    () => {
      new DispatchController();
    }
  );
};

class DispatchController {
  constructor() {
    this.sidebarMode = "Service Order";
    this.sidebarCollapsed = false;
    this.currentView = "gantt";
    this.cachedDocs = {};

    // Flags for view initialization
    this.viewInitialized = {
      gantt: false,
      calendar: false,
      map: false,
    };

    this.setup_navbar_buttons();
    this.setup_sidebar_header_events();

    // Create containers for each view
    this.createViewContainers();

    // Load sidebar items for default mode
    this.loadSidebarItems("Service Order");

    // Initialize default view (Gantt)
    this.switchView("gantt");
  }

  createViewContainers() {
    // Create and append containers for each view; they all reside in #view-content.
    const viewContent = $("#view-content");
    viewContent.empty();

    this.$ganttView = $(`
            <div id="gantt-view" class="view-container gantt-view" style="display: none;">
                <div id="gantt-page-body"></div>
            </div>
        `);

    this.$calendarView = $(`
            <div id="calendar-view" class="view-container" style="display: none;">
                <div id="calendar-page-body"></div>
            </div>
        `);
    this.$mapView = $(`
            <div id="map-view" class="view-container" style="display: none;">
                <div class="map-placeholder">
                    <h3>Map View</h3>
                    <p>Map UI goes here.</p>
                </div>
            </div>
        `);

    viewContent.append(this.$ganttView, this.$calendarView, this.$mapView);
  }

  // NAVBAR
  setup_navbar_buttons() {
    $("#sidebar-toggle-btn").on("click", () => {
      this.toggleSidebar();
    });
    $("#btn-gantt").on("click", () => {
      this.switchView("gantt");
    });
    $("#btn-calendar").on("click", () => {
      this.switchView("calendar");
    });
    $("#btn-map").on("click", () => {
      this.switchView("map");
    });
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    const $sidebar = $("#dispatch-sidebar");
    if (this.sidebarCollapsed) {
      $sidebar.addClass("collapsed");
      $("#sidebar-toggle-btn i")
        .removeClass("fa-angle-double-left")
        .addClass("fa-angle-double-right");
    } else {
      $sidebar.removeClass("collapsed");
      $("#sidebar-toggle-btn i")
        .removeClass("fa-angle-double-right")
        .addClass("fa-angle-double-left");
    }
  }

  // Instead of re-building views on every switch, we hide all and then show the target view.
  switchView(view) {
    $(".nav-view-btn").removeClass("active");
    $(`#btn-${view}`).addClass("active");
    this.currentView = view;

    // Hide all views
    $(".view-container").hide();

    if (view === "gantt") {
      this.$ganttView.show();
      if (!this.viewInitialized.gantt) {
        // Load Gantt from separate file (gantt.js)
        init_gantt("#gantt-page-body");
        this.viewInitialized.gantt = true;
      }
    } else if (view === "calendar") {
      this.$calendarView.show();
      if (!this.viewInitialized.calendar) {
        init_calendar_code("#calendar-page-body");
        this.viewInitialized.calendar = true;
      }
    } else if (view === "map") {
      this.$mapView.show();
      if (!this.viewInitialized.map) {
        // Initialize your Map view if needed.
        this.viewInitialized.map = true;
      }
    }
  }

  // SIDEBAR and other methods below remain largely unchanged...
  setup_sidebar_header_events() {
    $("#sidebar-dropdown-toggle").on("click", () => {
      $("#sidebar-dropdown").toggleClass("open");
    });

    $("#sidebar-add-icon").on("click", () => {
      this.open_create_schedule_dialog();
    });

    $("#sidebar-search-toggle").on("click", () => {
      $("#sidebar-inline-search").toggleClass("visible");
      if ($("#sidebar-inline-search").hasClass("visible")) {
        $("#sidebar-search-input").focus();
      }
    });

    $("#sidebar-refresh").on("click", () => {
      this.loadSidebarItems(this.sidebarMode, true);
    });

    $(".dropdown-tab").on("click", (e) => {
      let mode = $(e.currentTarget).data("mode");
      this.switchSidebarMode(mode);

      $(".dropdown-tab").removeClass("active");
      $(e.currentTarget).addClass("active");
    });

    $("#sidebar-search-input").on("keyup", () => {
      let val = $("#sidebar-search-input").val().toLowerCase();
      this.filterSidebarDocs(val);
    });
  }

  switchSidebarMode(mode) {
    this.sidebarMode = mode;
    $("#sidebar-selected-mode").text(mode);
    $("#sidebar-dropdown").removeClass("open");
    this.loadSidebarItems(mode, true);

    let placeholderText =
      mode === "Service Order"
        ? "Search Service Orders..."
        : "Search Service Appointments...";
    $("#sidebar-search-input").attr("placeholder", placeholderText);
  }

  loadSidebarItems(mode, forceRefresh = false) {
    let $sidebarList = $("#sidebar-list");
    $sidebarList.empty();

    frappe.call({
      method:
        "beveren_fsm.field_service_management.page.dispatch.dispatch.get_sidebar_data",
      args: { mode },
      callback: (r) => {
        if (!r.exc) {
          this.cachedDocs[mode] = r.message || [];
          this.renderSidebarDocs(this.cachedDocs[mode], mode);
        }
      },
    });
  }

  renderSidebarDocs(docs, mode) {
    let $sidebarList = $("#sidebar-list");
    $sidebarList.empty();

    docs.forEach((doc) => {
      let pillHtml = this.getPillHtml(doc, mode);
      let moreInfoHtml = this.getMoreInfoHtml(doc, mode);

      let li = $(`
                <li class="sidebar-doc-item"
                    data-doc='${JSON.stringify(doc)}'
                    data-mode="${mode}">
                    <a href="#">
                        <strong>${doc.name}</strong><br>
                        ${moreInfoHtml}
                        ${pillHtml}
                    </a>
                </li>
            `);
      $sidebarList.append(li);
    });

    this.setupSidebarRightClick();
  }

  filterSidebarDocs(searchVal) {
    let filtered = (this.cachedDocs[this.sidebarMode] || []).filter((doc) => {
      let docStr = JSON.stringify(doc).toLowerCase();
      return docStr.includes(searchVal);
    });
    this.renderSidebarDocs(filtered, this.sidebarMode);
  }

  setupSidebarRightClick() {
    $(document)
      .off("click.sidebarTooltip")
      .on("click.sidebarTooltip", () => {
        $("#sidebar-tooltip").hide();
      });

    $(".sidebar-doc-item")
      .off("contextmenu")
      .on("contextmenu", (e) => {
        e.preventDefault();
        let $li = $(e.currentTarget);
        let docStr = $li.attr("data-doc");
        let doc = JSON.parse(docStr || "{}");
        let mode = $li.attr("data-mode");
        this.showSidebarTooltip(e.pageX, e.pageY, doc, mode);
      });
  }

  getPillHtml(doc, mode) {
    if (mode === "Service Order") {
      let priority = (doc.priority || "").toLowerCase();
      let color = "#6c757d";
      if (priority === "high") color = "#dc3545";
      if (priority === "medium") color = "#ffc107";
      if (priority === "low") color = "#28a745";
      return `<span class="pill" style="background-color: ${color}; border-radius: 12px; font-size: 0.75rem;">${
        doc.priority || ""
      }</span>`;
    } else {
      let status = (doc.status || "").toLowerCase();
      let color = "#6c757d";
      if (status === "scheduled") color = "#007bff";
      if (status === "in progress") color = "#ffc107";
      if (status === "completed") color = "#28a745";
      if (status === "cancelled") color = "#dc3545";
      if (status === "dispatched") color = "#17a2b8";
      return `<span class="pill" style="background-color: ${color}; border-radius: 12px; font-size: 0.75rem;">${
        doc.status || ""
      }</span>`;
    }
  }

  getMoreInfoHtml(doc, mode) {
    if (mode === "Service Order") {
      let date = doc.posting_date || "";
      let customer = doc.customer || "";
      return `<span class="small-text" style="font-size: 0.8rem;">${date} - ${customer}</span><br>`;
    } else {
      let date = doc.posting_date || "";
      let start = doc.scheduled_start_datetime
        ? doc.scheduled_start_datetime.split(" ")[1]
        : "";
      let end = doc.scheduled_finish_datetime
        ? doc.scheduled_finish_datetime.split(" ")[1]
        : "";
      return `<span class="small-text" style="font-size: 0.8rem;">${date} - ${start} to ${end}</span><br>`;
    }
  }

  showSidebarTooltip(x, y, doc, mode) {
    let tooltip = $("#sidebar-tooltip");
    tooltip.empty().show();

    let itemsIcon = `<i class="fa fa-list"></i>`;
    let techsIcon = `<i class="fa fa-users"></i>`;
    let addIcon = `<i class="fa fa-plus"></i>`;

    let itemsBtn = `<button class="btn btn-sm btn-secondary" data-action="view-items" title="View Items">${itemsIcon}</button>`;
    let techsBtn =
      mode === "Service Appointment"
        ? `<button class="btn btn-sm btn-info" data-action="view-techs" title="View Technicians">${techsIcon}</button>`
        : ``;
    let addBtn = ``;
    if (mode === "Service Order") {
      if ((doc.status || "").toLowerCase() !== "completed") {
        addBtn = `<button class="btn btn-sm btn-success" data-action="add-item" title="Add">${addIcon}</button>`;
      }
    } else {
      addBtn = `<button class="btn btn-sm btn-primary" data-action="add-item" title="Create Invoice">${addIcon}</button>`;
    }

    let headerHtml = `
            <div class="tooltip-header">
                <strong>${doc.name}</strong>
                <div class="tooltip-buttons">
                    ${itemsBtn}
                    ${techsBtn}
                    ${addBtn}
                </div>
            </div>
        `;

    let bodyHtml = `<div class="tooltip-body">`;
    if (mode === "Service Order") {
      bodyHtml += `
                <p><strong>Customer:</strong> ${doc.customer || "N/A"}</p>
                <p><strong>Date:</strong> ${doc.posting_date || ""}</p>
                <p><strong>Status:</strong> ${doc.status || ""}</p>
                <p><strong>Priority:</strong> ${doc.priority || ""}</p>
            `;
    } else {
      bodyHtml += `
                <p><strong>Posting Date:</strong> ${doc.posting_date || ""}</p>
                <p><strong>Status:</strong> ${doc.status || ""}</p>
                <p><strong>Start:</strong> ${
                  doc.scheduled_start_datetime || ""
                }</p>
                <p><strong>Finish:</strong> ${
                  doc.scheduled_finish_datetime || ""
                }</p>
            `;
    }
    bodyHtml += `</div>`;

    tooltip.html(headerHtml + bodyHtml);

    let tooltipWidth = tooltip.outerWidth();
    let tooltipHeight = tooltip.outerHeight();
    let finalX = x + 10;
    let finalY = y;
    if (finalX + tooltipWidth > $(window).width()) {
      finalX = x - tooltipWidth - 10;
    }
    if (finalY + tooltipHeight > $(window).height()) {
      finalY = $(window).height() - tooltipHeight - 20;
    }
    tooltip.css({ left: finalX + "px", top: finalY + "px" });

    tooltip.find("[data-action='view-items']").on("click", () => {
      this.showItemsDialog(doc, mode);
    });
    if (mode === "Service Appointment") {
      tooltip.find("[data-action='view-techs']").on("click", () => {
        this.showTechniciansDialog(doc);
      });
    }
    tooltip.find("[data-action='add-item']").on("click", () => {
      if (mode === "Service Order") {
        this.create_event_for_order(doc);
      } else {
        frappe.confirm("Create an invoice for this appointment?", () => {
          frappe.msgprint("Proceed with invoice creation...");
        });
      }
    });
  }

  showItemsDialog(doc) {
    let dialog = new frappe.ui.Dialog({
      title: "Service Items",
      fields: [
        {
          fieldname: "service_items",
          fieldtype: "Table",
          label: __("Service Items"),
          in_place_edit: true,
          reqd: 1,
          fields: [
            {
              fieldname: "item_code",
              label: __("Item"),
              fieldtype: "Link",
              options: "Item",
              reqd: 1,
              in_list_view: 1,
            },
            {
              fieldname: "qty",
              label: __("Qty"),
              fieldtype: "Data",
              reqd: 1,
              in_list_view: 1,
            },
            {
              fieldname: "invoice_status",
              label: __("Invoice Status"),
              fieldtype: "Data",
              reqd: 1,
              in_list_view: 1,
            },
          ],
        },
      ],
      primary_action_label: "Close",
      primary_action: () => dialog.hide(),
    });

    let tableField = dialog.get_field("service_items");
    tableField.df.data = doc.items;
    tableField.grid.refresh();

    dialog.show();
  }

  showTechniciansDialog(doc) {
    let dialog = new frappe.ui.Dialog({
      title: "Technicians",
      fields: [
        {
          fieldname: "service_technicians",
          fieldtype: "Table",
          label: __("Service Technicians"),
          options: "Service Technician Item",
          in_place_edit: true,
          reqd: 1,
          fields: [
            {
              fieldname: "service_technician",
              label: __("Item"),
              fieldtype: "Link",
              options: "Item",
              reqd: 1,
              in_list_view: 1,
            },
            {
              fieldname: "full_name",
              label: __("Full Name"),
              fieldtype: "Data",
              fetch_from: "service_technician.full_name",
              reqd: 1,
              in_list_view: 1,
            },
          ],
        },
      ],
      primary_action_label: "Close",
      primary_action: () => dialog.hide(),
    });

    let tableField = dialog.get_field("service_technicians");
    tableField.df.data = doc.service_technicians;
    tableField.grid.refresh();

    dialog.show();
  }

  create_event_for_order(orderDoc = null) {
    if (!orderDoc) {
      frappe.prompt(
        [
          {
            fieldname: "service_order",
            label: "Service Order",
            fieldtype: "Link",
            options: "Service Order",
            reqd: 1,
          },
        ],
        (values) => {
          this.open_create_schedule_dialog(values.service_order);
        },
        "Create Schedule",
        "Create"
      );
    } else {
      this.open_create_schedule_dialog(orderDoc.name);
    }
  }

  open_create_schedule_dialog(OrderName = "") {
    let selectedDate = frappe.datetime.get_today();
    let d = new frappe.ui.Dialog({
      title: "Create Schedule",
      fields: [
        {
          fieldname: "service_order",
          fieldtype: "Link",
          options: "Service Order",
          label: "Service Order",
          default: OrderName,
          reqd: 1,
        },
        { fieldtype: "Column Break" },
        {
          fieldname: "selected_date",
          fieldtype: "Date",
          label: "Selected Date",
          default: selectedDate,
        },
        {
          fieldname: "start_time",
          fieldtype: "Time",
          label: "Start Time",
          default: "09:00",
        },
        {
          fieldname: "finish_time",
          fieldtype: "Time",
          label: "Finish Time",
          default: "10:00",
        },
      ],
      primary_action_label: "Schedule & Dispatch",
      primary_action: (values) => {
        let scheduledStart = values.selected_date + " " + values.start_time;
        let scheduledFinish = values.selected_date + " " + values.finish_time;
        create_appointment(
          values.selected_date,
          values.service_order,
          scheduledStart,
          scheduledFinish,
          "TECH-0001",
          (r) => {
            frappe.msgprint("Appointment created for " + values.service_order);
          }
        );
        d.hide();
      },
    });
    d.show();
  }
}
