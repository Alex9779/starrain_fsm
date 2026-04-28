import frappe
from frappe.model.utils.rename_field import rename_field


def execute():
	doctypes = [
		"Service Request",
		"Service Quotation",
		"Service Order",
		"Service Appointment",
	]
	for doctype in doctypes:
		if frappe.db.has_column(doctype, "customer_contact"):
			rename_field(doctype, "customer_contact", "contact_person")
