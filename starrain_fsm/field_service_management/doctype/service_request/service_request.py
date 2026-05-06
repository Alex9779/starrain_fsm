# Copyright (c) 2025, Beveren Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import add_days, getdate, today
from starrain_fsm.field_service_management.utils.address_util import get_address_details, get_contact_details


class ServiceRequest(Document):
	def validate(self):
		self.refresh_address_contact_details()

	def before_cancel(self):
		self.status = "Cancelled"

	def refresh_address_contact_details(self):
		if self.customer_address:
			self.address_details = get_address_details(self.customer_address).get("details", "")
		if self.contact_person:
			self.contact_details = get_contact_details(self.contact_person).get("details", "")


def update_status():
	current_date = getdate(today())
	two_days_from_now = add_days(today(), 2)

	docs_to_update_due_soon = frappe.get_all(
		"Service Request", filters={"due_date": two_days_from_now, "status": "Open"}, fields=["name"]
	)

	docs_to_update_overdue = frappe.get_all(
		"Service Request",
		filters={"due_date": ["<", current_date], "status": ["in", ["Open", "Due Soon"]]},
		fields=["name"],
	)

	for doc in docs_to_update_due_soon:
		document = frappe.get_doc("Service Request", doc["name"])
		document.status = "Due Soon"
		document.save()

	for doc in docs_to_update_overdue:
		document = frappe.get_doc("Service Request", doc["name"])
		document.status = "Overdue"
		document.save()

	frappe.db.commit()
