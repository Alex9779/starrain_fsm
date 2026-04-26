// Copyright (c) 2026, ALITECS Alexander Leisentritt and contributors
// For license information, please see license.txt

frappe.ui.form.on("Service Report", {
	refresh(frm) {
		if (frm.doc.docstatus === 1) {
			frm.add_custom_button(__("Open Service Appointment"), () => {
				frappe.set_route("Form", "Service Appointment", frm.doc.service_appointment);
			});
		}
	},
});
