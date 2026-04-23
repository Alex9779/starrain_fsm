// Ensure this namespace exists
frappe.provide("starrain_fsm.field_service_management");

cur_frm.cscript.tax_table = "Sales Taxes and Charges";
erpnext.accounts.taxes.setup_tax_validations(
  "Sales Taxes and Charges Template"
);
erpnext.accounts.taxes.setup_tax_filters("Sales Taxes and Charges");
erpnext.sales_common.setup_selling_controller();

frappe.ui.form.on("Service Order", {
  setup: function (frm) {
    frm.custom_make_buttons = {
      "Service Appointment": "Service Appointment",
    };
  },
  onload: function (frm) {
    // Hide either quotation or request
    if (frm.doc.service_request) frm.toggle_enable("service_quotation", 0);
    if (frm.doc.service_quotation) frm.toggle_enable("service_request", 0);
  },
  validate: function (frm) {},
  refresh(frm) {
    if (frm.doc.docstatus === 0) {
      frm.__over_budget_confirmed = false;
    }

    // set posting date
    frm.trigger("set_posting_date");

    // Hide either quotation or request
    if (frm.doc.service_request) frm.toggle_enable("service_quotation", 0);
    if (frm.doc.service_quotation) frm.toggle_enable("service_request", 0);

    // Enable/Disable Invoicing
    frm.trigger("set_enable_invoicing");
    frm.trigger("disable_creating_appointment");
    frm.trigger("disable_items_edit");

    // if(frm.doc.status == 'Open' && !frm.doc.__islocal){
    // 	frm.add_custom_button(
    // 		__("Hold"),
    // 		() => frappe.msgprint('Coming Soon!'),
    // 		__("Status")
    // 	);
    // 	frm.add_custom_button(
    // 		__("Complete"),
    // 		() => frappe.msgprint('Coming Soon!'),
    // 		__("Status")
    // 	);
    // }
    if (frm.doc.docstatus === 1 && !frm.is_dirty()) {
      if (["Open", "Assessed"].includes(frm.doc.status)) {
        frm.add_custom_button(
          __("Service Appointment"),
          () => {
            frm.trigger("make_appointment_from_order");
          },
          __("Create")
        );
        cur_frm.page.set_inner_btn_group_as_primary(__("Create"));
      }

      if (frm.doc.status === "Assessed") {
        frm.add_custom_button(
          __("Service Quotation"),
          () => frm.trigger("make_quotation_from_order"),
          __("Create")
        );
        frm.add_custom_button(
          __("Service Order"),
          () => frm.trigger("make_order_from_assessed"),
          __("Create")
        );
        cur_frm.page.set_inner_btn_group_as_primary(__("Create"));
      }

      if (!["Open", "Assessed"].includes(frm.doc.status)) {
        frm.trigger("hide_create_icon_buttons");
      }
    }

    
  },
  set_posting_date: function (frm) {
    if (!frm.doc.posting_date) {
      frm.set_value("posting_date", frappe.datetime.get_today());
    }
  },
  customer: function (frm) {
    frm.set_query("customer_address", function (doc) {
      return {
        filters: {
          link_doctype: "Customer",
          link_name: doc.customer,
        },
      };
    });
    frm.set_query("customer_contact", function (doc) {
      return {
        filters: {
          link_doctype: "Customer",
          link_name: doc.customer,
        },
      };
    });
  },
  customer_address: function (frm) {
    if (frm.doc.customer_address) {
      frappe.call({
        method:
          "starrain_fsm.field_service_management.utils.address_util.get_address_details",
        args: { customer_address: frm.doc.customer_address },
        callback: function (r) {
          let details = r.message["details"] || "";
          frm.set_value("address_details", details);
        },
      });
    } else {
      frm.set_value("address_details", "");
    }
  },
  customer_contact: function (frm) {
    if (frm.doc.customer_contact) {
      frappe.call({
        method:
          "starrain_fsm.field_service_management.utils.address_util.get_contact_details",
        args: { customer_contact: frm.doc.customer_contact },
        callback: function (r) {
          let details = r.message["details"] || "";
          frm.set_value("contact_details", details);
        },
      });
    } else {
      frm.set_value("contact_details", "");
    }
  },
  set_enable_invoicing: (frm) => {
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
  disable_items_edit: (frm) => {
    //when appointment is going on, if anything add in appointment
    const can_edit = frm.doc.docstatus === 0 || ["Open", "Assessed"].includes(frm.doc.status);
    frm.toggle_enable(["items", "service_technicians"], can_edit);
  },
  disable_creating_appointment: (frm) => {
    if (![
      "Scheduled", "Completed",
    ].includes(frm.doc.status)) {
      return;
    } else {
      $('.open-notification[title="Open Service Appointment"]').hide();
      $('.icon-btn[data-doctype="Service Appointment"]').hide();
    }
  },
  hide_create_icon_buttons: (frm) => {
    const doctypesToHide = [
      "Service Appointment",
      "Sales Invoice",
    ];

    doctypesToHide.forEach((doctype) => {
      $(`.open-notification[title="Open ${doctype}"]`).hide();
      $(`.icon-btn[data-doctype="${doctype}"]`).hide();
    });
  },
  make_appointment_from_order: (frm) => {
    frappe.model.open_mapped_doc({
      method:
        "starrain_fsm.field_service_management.doctype.service_appointment.service_appointment.make_appointment_from_order",
      frm: frm,
    });
  },
  make_quotation_from_order: (frm) => {
    frappe.model.open_mapped_doc({
      method:
        "starrain_fsm.field_service_management.doctype.service_quotation.service_quotation.make_quotation_from_order",
      frm: frm,
    });
  },
  make_order_from_assessed: (frm) => {
    frappe.model.open_mapped_doc({
      method:
        "starrain_fsm.field_service_management.doctype.service_order.service_order.make_order_from_assessed",
      frm: frm,
    });
  },
  create_service_invoice: (frm) => {
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
          max_qty: remaining_qty,
          rate: item.rate,
          amount: item.rate * remaining_qty,
        });
      }
    });

    if (non_invoiced_items.length === 0) {
      frappe.msgprint("This Order is already fully Invoiced.");
      return;
    }

    function mergeDuplicates(items) {
      let mergedItems = items.reduce((acc, item) => {
        let existingItem = acc.find((i) => i.item_code === item.item_code);
        if (existingItem) {
          existingItem.qty += item.qty;
          existingItem.max_qty += item.max_qty;
          existingItem.amount = existingItem.rate * existingItem.qty;
        } else {
          acc.push({ ...item });
        }
        return acc;
      }, []);
      return mergedItems;
    }
    non_invoiced_items = mergeDuplicates(non_invoiced_items);

    // Create the dialog to show non-invoiced items
    const dialog = new frappe.ui.Dialog({
      title: __("Services and Parts to Invoice"),
      fields: [
        {
          fieldname: "service_items",
          fieldtype: "Table",
          label: __("Services and Parts"),
          options: "Service Order Item",
          in_place_edit: true,
          reqd: 1,
          fields: [
            {
              fieldname: "item_code",
              label: __("Item Code"),
              fieldtype: "Link",
              options: "Item",
              in_list_view: 1,
            },
            {
              fieldname: "qty",
              label: __("Quantity"),
              fieldtype: "Float",
              in_list_view: 1,
            },
            {
              fieldname: "rate",
              label: __("Rate"),
              fieldtype: "Currency",
              in_list_view: 1,
              read_only: 1,
            },
            {
              fieldname: "amount",
              label: __("Amount"),
              fieldtype: "Currency",
              in_list_view: 1,
            },
            {
              fieldname: "max_qty",
              label: __("Max Quantity"),
              fieldtype: "Float",
              hidden: 1,
            },
          ],
        },
      ],
      primary_action: (values) => {
        let tableField = dialog.get_field("service_items");
        tableField.df.data.forEach((item) => {
          if (item.max_qty < item.qty) {
            frappe.throw(
              __("Quantity for {0} cannot exceed {1}", [
                item.item_code,
                item.max_qty,
              ])
            );
            return;
          }
          item.amount = item.rate * item.qty;
        });
        tableField.grid.refresh();
        frappe.call({
          method:
            "starrain_fsm.field_service_management.fsm_utils.create_service_invoice",
          args: {
            docname: frm.doc.name,
            doctype: frm.doc.doctype,
            customer: frm.doc.customer,
            items: values.service_items,
          },
          callback: function (r) {
            if (r.message) {
              frappe.set_route("Form", "Sales Invoice", r.message);
            }
          },
        });
        dialog.hide();
      },
      primary_action_label: __("Create Invoice"),
      secondary_action: (e, values) => {
        let tableField = dialog.get_field("service_items");
        tableField.df.data.forEach((item) => {
          if (item.max_qty < item.qty) {
            frappe.throw(
              __("Quantity for {0} cannot exceed {1}", [
                item.item_code,
                item.max_qty,
              ])
            );
            return;
          }
          item.amount = item.rate * item.qty;
        });
        tableField.grid.refresh();
      },
      secondary_action_label: __("Refresh Amount"),
    });
    let tableField = dialog.get_field("service_items");
    tableField.df.data = non_invoiced_items;
    tableField.grid.refresh();

    dialog.show();
  },
});

starrain_fsm.field_service_management.ServiceOrderController = class ServiceOrderController extends (
  erpnext.selling.SellingController
) {
  onload(doc, dt, dn) {
    super.onload(doc, dt, dn);
  }
  refresh(doc, dt, dn) {
    super.refresh(doc, dt, dn);
    if (doc.__islocal && !doc.posting_date) {
      this.frm.set_value("posting_date", frappe.datetime.get_today());
    }
    if (doc.__islocal && !doc.due_date) {
      const base = doc.posting_date || frappe.datetime.get_today();
      frappe.db.get_single_value("Field Service Management Settings", "default_due_date_after").then(days => {
        this.frm.set_value("due_date", frappe.datetime.add_days(base, days || 10));
      });
    }
  }
};

cur_frm.script_manager.make(
  starrain_fsm.field_service_management.ServiceOrderController
);
frappe.ui.form.on("Service Order Item", {
  item_code(frm, cdt, cdn) {
    const row = frappe.get_doc(cdt, cdn);
    if (!row.item_code) {
      return;
    }

    frappe.db.get_value("Item", row.item_code, "item_group").then((r) => {
      const itemGroup = (r.message?.item_group || "").trim().toLowerCase();

      const isService = ["service", "services"].includes(itemGroup) ? 1 : 0;

      if (row.is_service !== isService) {
        frappe.model.set_value(cdt, cdn, "is_service", isService);
      }
    });
  },
  items_on_form_rendered(frm, cdt, cdn) {
    // enable tax_amount field if Actual
  },
  packed_items_on_form_rendered(frm, cdt, cdn) {
    // enable tax_amount field if Actual
  },
});
