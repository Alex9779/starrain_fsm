// Copyright (c) 2015, Beveren Software Inc. and Contributors
// License: GNU General Public License v3. See license.txt

// Ensure this namespace exists
frappe.provide("starrain_fsm.field_service_management");

cur_frm.cscript.tax_table = "Sales Taxes and Charges";

erpnext.accounts.taxes.setup_tax_validations(
  "Sales Taxes and Charges Template"
);
erpnext.accounts.taxes.setup_tax_filters("Sales Taxes and Charges");
// erpnext.pre_sales.set_as_lost("Service Quotation");
erpnext.sales_common.setup_selling_controller();

frappe.ui.form.on("Service Quotation", {
  setup: function (frm) {
    // Create a custom button for Service Order mapping
    frm.custom_make_buttons = {
      "Service Order": "Service Order",
    };
  },
  refresh: function (frm) {
    // Render address/contact HTML on load
    frm.trigger("service_address");
    frm.trigger("customer_contact");

    // Status Buttons
    if (
      frm.doc.docstatus === 1 &&
      !["Ordered", "Converted"].includes(frm.doc.status)
    ) {
      if (frm.doc.status === "On Hold") {
        frm.add_custom_button(
          __("Resume"),
          function () {
            frm.set_value("status", "Open");
            frm.save("Submit");
          },
          __("Status")
        );
      } else {
        frm.add_custom_button(
          __("Hold"),
          function () {
            frm.set_value("status", "On Hold");
            frm.save("Submit");
          },
          __("Status")
        );
      }
      if (frm.doc.status === "Closed") {
        frm.add_custom_button(
          __("Reopen"),
          function () {
            frm.set_value("status", "Open");
            frm.save("Submit");
            frm.remove_custom_button("Create");
          },
          __("Status")
        );
      } else {
        frm.add_custom_button(
          __("Close"),
          function () {
            frm.set_value("status", "Closed");
            frm.save("Submit");
            frm.remove_custom_button("Create");
          },
          __("Status")
        );
      }
    }

    frm.trigger("set_label");
    frm.trigger("set_dynamic_field_label");
    frm.trigger("disable_creating_order");

    frm.set_query("project", function (doc) {
      return {
        filters: {
          customer: frm.doc.party_name,
          company: frm.doc.company,
        },
      };
    });

    // Add lost dialog trigger if status is not Ordered
    if (
      frm.doc.docstatus === 1 &&
      !["Lost", "Ordered", "Converted"].includes(frm.doc.status)
    ) {
      frm.add_custom_button(__("Set as Lost"), () => {
        frm.trigger("set_as_lost_dialog");
      });
    }

    // Create Service Order button if quotation is submitted and valid
    if (
      frm.doc.docstatus === 1 &&
      !["Lost", "Closed", "On Hold", "Ordered", "Converted"].includes(
        frm.doc.status
      )
    ) {
      frm.add_custom_button(
        __("Service Order"),
        () => {
          frm.trigger("make_order_from_quote");
        },
        __("Create")
      );
      cur_frm.page.set_inner_btn_group_as_primary(__("Create"));
    }
  },
  disable_creating_order: (frm) => {
    if (
      !["Lost", "On Hold", "Closed", "Ordered", "Converted"].includes(
        frm.doc.status
      )
    ) {
      return;
    } else {
      $('.open-notification[title="Open Service Order"]').hide();
      $('.icon-btn[data-doctype="Service Order"]').hide();
    }
  },
  make_order_from_quote: (frm) => {
    frappe.model.open_mapped_doc({
      method:
        "starrain_fsm.field_service_management.doctype.service_order.service_order.make_order_from_quote",
      frm: frm,
    });
  },
  quotation_to: function (frm) {
    frm.trigger("toggle_reqd_lead_customer");
    frm.trigger("set_dynamic_field_label");
    frm.set_value("party_name", "");
  },

  party_name: function (frm) {
    if (frm.doc.party !== "Customer") return;
    frm.set_query("service_address", function (doc) {
      return {
        filters: {
          link_doctype: "Customer",
          link_name: doc.party_name,
        },
      };
    });
    frm.set_query("customer_contact", function (doc) {
      return {
        filters: {
          link_doctype: "Customer",
          link_name: doc.party_name,
        },
      };
    });
  },

  service_address: function (frm) {
    if (frm.doc.service_address) {
      frappe.call({
        method:
          "starrain_fsm.field_service_management.utils.address_util.get_address_details",
        args: { customer_address: frm.doc.service_address },
        callback: function (r) {
          let details = r.message["details"] || "";
          frm.fields_dict["address_details"].$wrapper.html(details);
        },
      });
    } else {
      frm.fields_dict["address_details"].$wrapper.html("");
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
          frm.fields_dict["contact_details"].$wrapper.html(details);
        },
      });
    } else {
      frm.fields_dict["contact_details"].$wrapper.html("");
    }
  },

  // This event ensures the "Set as Lost" button works.
  set_as_lost_dialog: function (frm) {
    const dialog = new frappe.ui.Dialog({
      title: __("Set Quotation as Lost"),
      fields: [
        {
          fieldname: "lost_reason",
          label: __("Lost Reason"),
          fieldtype: "Small Text",
          reqd: 1,
        },
      ],
      primary_action_label: __("Update"),
      primary_action: function (values) {
        frm.set_value("lost_reason", values.lost_reason);
        frm.set_value("status", "Lost");
        dialog.hide();
        frm.save("Update");
      },
    });
    dialog.show();
  },
});

starrain_fsm.field_service_management.ServiceQuotationController = class ServiceQuotationController extends (
  erpnext.selling.SellingController
) {
  onload(doc, dt, dn) {
    super.onload(doc, dt, dn);
  }

  party_name() {
    var me = this;
    erpnext.utils.get_party_details(this.frm, null, null, function () {
      me.apply_price_list();
    });
  }

  refresh(doc, dt, dn) {
    super.refresh(doc, dt, dn);
    frappe.dynamic_link = {
      doc: this.frm.doc,
      fieldname: "party_name",
      doctype: doc.quotation_to,
    };

    var me = this;

    if (doc.__islocal && !doc.due_date) {
      const base = doc.posting_date || frappe.datetime.get_today();
      frappe.db.get_single_value("Field Service Management Settings", "default_due_date_after").then(days => {
        this.frm.set_value("due_date", frappe.datetime.add_days(base, days || 10));
      });
    }

    this.toggle_reqd_lead_customer();
  }

  set_dynamic_field_label() {
    if (this.frm.doc.quotation_to === "Customer") {
      this.frm.set_df_property("party_name", "label", "Customer");
      this.frm.fields_dict.party_name.get_query = null;
    } else if (this.frm.doc.quotation_to === "Lead") {
      this.frm.set_df_property("party_name", "label", "Lead");
      this.frm.fields_dict.party_name.get_query = function () {
        return { query: "erpnext.controllers.queries.lead_query" };
      };
    } else if (this.frm.doc.quotation_to === "Prospect") {
      this.frm.set_df_property("party_name", "label", "Prospect");
      this.frm.fields_dict.party_name.get_query = null;
    }
  }

  toggle_reqd_lead_customer() {
    this.frm.toggle_reqd("party_name", this.frm.doc.quotation_to);
  }

  validate_company_and_party(party_field) {
    if (!this.frm.doc.quotation_to) {
      frappe.msgprint(
        __("Please select a value for {0} quotation_to {1}", [
          this.frm.doc.doctype,
          this.frm.doc.name,
        ])
      );
      return false;
    } else if (this.frm.doc.quotation_to === "Lead") {
      return true;
    } else {
      return super.validate_company_and_party(party_field);
    }
  }
};

cur_frm.script_manager.make(
  starrain_fsm.field_service_management.ServiceQuotationController
);

frappe.ui.form.on(
  "Service Quotation Item",
  "items_on_form_rendered",
  "packed_items_on_form_rendered",
  function (frm, cdt, cdn) {
    // enable tax_amount field if Actual
  }
);

frappe.ui.form.on(
  "Service Quotation Item",
  "stock_balance",
  function (frm, cdt, cdn) {
    var d = frappe.model.get_doc(cdt, cdn);
    frappe.route_options = { item_code: d.item_code };
    frappe.set_route("query-report", "Stock Balance");
  }
);
