# Copyright (c) 2025, Beveren Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import add_days, getdate, today


class ServiceRequest(Document):
	pass


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
