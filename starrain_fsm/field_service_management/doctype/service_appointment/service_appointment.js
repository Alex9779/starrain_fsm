// Copyright (c) 2025, Beveren Software and contributors
// For license information, please see license.txt

frappe.ui.form.on("Service Appointment", {
  onload: function (frm) {
    // Lock service_order field once set (it drives the appointment)
    if (frm.doc.service_order && !frm.doc.__islocal) frm.toggle_enable("service_order", 0);
  },
  refresh(frm) {
    // Set Posting Date
    if (frm.doc.__islocal && !frm.doc.posting_date) {
      frm.set_value("posting_date", frappe.datetime.get_today());
    }

    // Render address/contact HTML on load
    frm.trigger("customer_address");
    frm.trigger("contact_person");

    // Lock service_order field once set
    if (frm.doc.service_order && !frm.doc.__islocal) frm.toggle_enable("service_order", 0);

    frm.trigger("disable_invoicing");
    frm.trigger("disable_items_and_techs_edit");
    frm.trigger("disable_schedule_fields_on_submit");
    frm.trigger("handle_actual_time_fields");

    if (frm.doc.docstatus == 1 && !frm.is_dirty()) {
      // Always allow creating a Service Report for submitted appointments
      frm.add_custom_button(
        __("Service Report"),
        () => {
          frappe.new_doc("Service Report", {
            service_appointment: frm.doc.name,
            report_date: frappe.datetime.get_today(),
            customer: frm.doc.customer,
          });
        },
        __("Create")
      );

      if (frm.doc.status == "Scheduled") {
        frm
          .add_custom_button(__("Complete"), function () {
            // 1. Check actual times synchronously
            if (!frm.doc.actual_start_datetime) {
              frappe.msgprint({
                title: __("Cannot Complete"),
                message: __("Please enter the Actual Start Datetime before completing."),
                indicator: "orange",
              });
              return;
            }
            if (!frm.doc.actual_finish_datetime) {
              frappe.msgprint({
                title: __("Cannot Complete"),
                message: __("Please enter the Actual Finish Datetime before completing."),
                indicator: "orange",
              });
              return;
            }
            // 2. Check for a submitted Service Report before asking to confirm
            frappe.db
              .get_list("Service Report", {
                filters: { service_appointment: frm.doc.name, docstatus: 1 },
                limit: 1,
              })
              .then((reports) => {
                if (!reports || reports.length === 0) {
                  frappe.msgprint({
                    title: __("Cannot Complete"),
                    message: __(
                      "At least one submitted Service Report is required before completing this appointment."
                    ),
                    indicator: "orange",
                  });
                  return;
                }
                frappe.confirm(
                  __("Are you sure you want to complete this appointment?"),
                  () => {
                    frm.set_value("status", "Completed");
                    frm.save("Update");
                  }
                );
              });
          })
          .removeClass("btn-default")
          .addClass("btn-success");
        frm
          .add_custom_button(__("Reschedule"), function () {
            frm.trigger("schedule_appointment");
          })
          .removeClass("btn-default")
          .addClass("btn-info");
      }
      // Enable Invoice only for Completed appointments
      if (frm.doc.status == "Completed") {
        let items = frm.doc.items || [];
        let non_invoiced_items = [];
        items.forEach((item) => {
          let invoiced_qty = item.invoiced_qty || 0;
          let remaining_qty = item.qty - invoiced_qty;
          if (remaining_qty > 0) {
            non_invoiced_items.push({
              item_code: item.item_code,
            });
          }
        });

        if (non_invoiced_items.length) {
          frm.add_custom_button(
            __("Sales Invoice"),
            () => {
              frm.trigger("invoice_appointment");
            },
            __("Create")
          );
        }
        cur_frm.page.set_inner_btn_group_as_primary(__("Create"));
      }
    }
  },
  disable_invoicing: (frm) => {
    // Fetch all parts and services which are not invoiced
    let items = frm.doc.items || [];
    let non_invoiced_items = [];
    items.forEach((item) => {
      let invoiced_qty = item.invoiced_qty || 0;
      let remaining_qty = item.qty - invoiced_qty;
      if (remaining_qty > 0) {
        non_invoiced_items.push({
          item_code: item.item_code,
        });
      }
    });

    if (non_invoiced_items.length) {
      return;
    } else {
      $('.open-notification[title="Open Sales Invoice"]').hide();
      $('.icon-btn[data-doctype="Sales Invoice"]').hide();
    }
  },
  handle_actual_time_fields: (frm) => {
    const editable = frm.doc.docstatus == 1 && frm.doc.status == "Scheduled";
    frm.set_df_property("actual_start_datetime", "read_only", editable ? 0 : 1);
    frm.set_df_property("actual_finish_datetime", "read_only", editable ? 0 : 1);
  },
  disable_items_and_techs_edit: (frm) => {
    //when appointment is complete
    let is_not_allowed = !["Completed"].includes(frm.doc.status);
    frm.toggle_enable(["items", "service_technicians"], is_not_allowed);
  },
  customer: function (frm) {
    frm.set_query("customer_address", function (doc) {
      return {
        filters: { link_doctype: "Customer", link_name: doc.customer },
      };
    });
    frm.set_query("contact_person", function (doc) {
      return {
        filters: { link_doctype: "Customer", link_name: doc.customer },
      };
    });

    // Auto-select the default address and contact when customer changes
    frm.set_value("customer_address", "");
    frm.set_value("contact_person", "");
    if (frm.doc.customer) {
      frappe.call({
        method:
          "starrain_fsm.field_service_management.utils.address_util.get_default_customer_address_and_contact",
        args: { customer: frm.doc.customer },
        callback: function (r) {
          if (r.message) {
            if (r.message.address) frm.set_value("customer_address", r.message.address);
            if (r.message.contact) frm.set_value("contact_person", r.message.contact);
          }
        },
      });
    }
  },
  customer_address: function (frm) {
    if (frm.doc.customer_address) {
      frappe.call({
        method:
          "starrain_fsm.field_service_management.utils.address_util.get_address_details",
        args: { customer_address: frm.doc.customer_address },
        callback: function (r) {
          frm.fields_dict["address_details"].$wrapper.html(r.message["details"] || "");
        },
      });
    } else {
      frm.fields_dict["address_details"].$wrapper.html("");
    }
  },
  contact_person: function (frm) {
    if (frm.doc.contact_person) {
      frappe.call({
        method:
          "starrain_fsm.field_service_management.utils.address_util.get_contact_details",
        args: { contact_person: frm.doc.contact_person },
        callback: function (r) {
          frm.fields_dict["contact_details"].$wrapper.html(r.message["details"] || "");
        },
      });
    } else {
      frm.fields_dict["contact_details"].$wrapper.html("");
    }
  },
  disable_schedule_fields_on_submit: (frm) => {
    if (frm.doc.docstatus == 1) {
      frm.set_df_property("scheduled_start_datetime", "read_only", 1);
      frm.set_df_property("scheduled_finish_datetime", "read_only", 1);
      frm.set_df_property("customer_address", "read_only", 1);
      frm.set_df_property("contact_person", "read_only", 1);
    }
  },

  make_quotation_from_appointment: (frm) => {
    frappe.model.open_mapped_doc({
      method:
        "starrain_fsm.field_service_management.doctype.service_quotation.service_quotation.make_quotation_from_appointment",
      frm: frm,
    });
  },

  make_order_from_appointment: (frm) => {
    frappe.model.open_mapped_doc({
      method:
        "starrain_fsm.field_service_management.doctype.service_order.service_order.make_order_from_appointment",
      frm: frm,
    });
  },

  invoice_appointment: (frm) => {
    let items = frm.doc.items || [];
    let non_invoiced_items = [];

    items.forEach((item) => {
      let invoiced_qty = item.invoiced_qty || 0;
      let remaining_qty = item.qty - invoiced_qty;
      if (remaining_qty > 0) {
        non_invoiced_items.push({
          item_code: item.item_code,
          item_name: item.item_name,
          qty: remaining_qty,
          rate: item.rate,
        });
      }
    });

    if (non_invoiced_items.length === 0) {
      frappe.msgprint(__("This Appointment is already fully Invoiced."));
      return;
    }

    // Merge duplicate item_codes
    non_invoiced_items = non_invoiced_items.reduce((acc, item) => {
      let existing = acc.find((i) => i.item_code === item.item_code);
      if (existing) {
        existing.qty += item.qty;
      } else {
        acc.push({ ...item });
      }
      return acc;
    }, []);

    frappe.call({
      method: "starrain_fsm.field_service_management.fsm_utils.create_service_invoice",
      args: {
        docname: frm.doc.name,
        doctype: frm.doc.doctype,
        customer: frm.doc.customer,
        items: JSON.stringify(non_invoiced_items),
      },
      callback: function (r) {
        if (r.message) {
          frappe.set_route("Form", "Sales Invoice", r.message);
        }
      },
    });
  },

  schedule_appointment: (frm) => {
    prompt_title =
      frm.doc.status == "Scheduled"
        ? "Reschedule Appointment"
        : "Schedule Appointment";
    primary_action_label =
      frm.doc.status == "Scheduled" ? "Reschedule" : "Schedule";
    frappe.prompt(
      [
        {
          label: "Scheduled Start Datetime",
          fieldname: "scheduled_start_datetime",
          fieldtype: "Datetime",
          default: frm.doc.scheduled_start_datetime,
        },
        {
          fieldname: "column_break_appointment",
          fieldtype: "Column Break",
        },
        {
          label: "Scheduled Finish Datetime",
          fieldname: "scheduled_finish_datetime",
          fieldtype: "Datetime",
          default: frm.doc.scheduled_finish_datetime,
        },
        {
          fieldname: "section_break_address",
          fieldtype: "Section Break",
          label: "Service Address & Contact",
        },
        {
          label: "Service Address",
          fieldname: "customer_address",
          fieldtype: "Link",
          options: "Address",
          default: frm.doc.customer_address,
          get_query: () => ({
            filters: { link_doctype: "Customer", link_name: frm.doc.customer },
          }),
        },
        {
          fieldname: "column_break_contact",
          fieldtype: "Column Break",
        },
        {
          label: "Contact Person",
          fieldname: "contact_person",
          fieldtype: "Link",
          options: "Contact",
          default: frm.doc.contact_person,
          get_query: () => ({
            filters: { link_doctype: "Customer", link_name: frm.doc.customer },
          }),
        },
      ],
      (values) => {
        frappe.model.set_value(
          frm.doctype,
          frm.docname,
          "scheduled_start_datetime",
          values.scheduled_start_datetime
        );
        frappe.model.set_value(
          frm.doctype,
          frm.docname,
          "scheduled_finish_datetime",
          values.scheduled_finish_datetime
        );
        if (values.customer_address) {
          frm.set_value("customer_address", values.customer_address);
        }
        if (values.contact_person) {
          frm.set_value("contact_person", values.contact_person);
        }
        frm.set_value("status", "Scheduled");
        frm.save("Update");
      },
      prompt_title,
      primary_action_label
    );
  },
});

