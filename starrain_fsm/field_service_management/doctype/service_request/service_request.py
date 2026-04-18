# Copyright (c) 2025, Beveren Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import add_days, getdate, today


class ServiceRequest(Document):
	def after_insert(self):
		self._sync_address_dynamic_link(old_address=None)

	def on_update(self):
		old_address = self.get_doc_before_save() and self.get_doc_before_save().customer_address
		self._sync_address_dynamic_link(old_address=old_address)

	def on_trash(self):
		self._remove_address_dynamic_link(self.customer_address)

	def _sync_address_dynamic_link(self, old_address):
		new_address = self.customer_address
		if old_address == new_address:
			return
		if old_address:
			self._remove_address_dynamic_link(old_address)
		if new_address:
			self._add_address_dynamic_link(new_address)

	def _add_address_dynamic_link(self, address_name):
		addr = frappe.get_doc("Address", address_name)
		already_linked = any(
			lnk.link_doctype == self.doctype and lnk.link_name == self.name
			for lnk in addr.links
		)
		if not already_linked:
			addr.append("links", {"link_doctype": self.doctype, "link_name": self.name})
			addr.save(ignore_permissions=True)

	def _remove_address_dynamic_link(self, address_name):
		if not address_name:
			return
		addr = frappe.get_doc("Address", address_name)
		addr.links = [
			lnk for lnk in addr.links
			if not (lnk.link_doctype == self.doctype and lnk.link_name == self.name)
		]
		addr.save(ignore_permissions=True)


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
