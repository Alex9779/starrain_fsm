import frappe
from frappe.model.utils.rename_field import rename_field


def execute():
	if frappe.db.has_column("Service Appointment", "service_type"):
		rename_field("Service Appointment", "service_type", "type")
