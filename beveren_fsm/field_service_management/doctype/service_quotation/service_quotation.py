# Copyright (c) 2025, Beveren Software and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc


class ServiceQuotation(Document):
	def validate(self):
		self.validate_items()

	def before_submit(self):
		if self.service_request:
			request = frappe.get_doc("Service Request", self.service_request)
			request.status = "Quotation"
			request.save()

	def on_cancel(self):
		self.cancel_linked_request()

	def validate_items(self):
		if not self.items:
			frappe.throw(_("Please add at least one item"))

	def cancel_linked_request(self):
		if not self.service_request:
			return
		request = frappe.get_doc("Service Request", self.service_request)
		request.status = "Open"
		self.service_request = ""
		request.save()


@frappe.whitelist()
def make_service_quotation(source_name, target_doc=None, selected_items=None):
	mapping = {
		"Service Request": {
			"doctype": "Service Quotation",
			"field_map": {
				"name": "service_request",
				"customer": "party_name",
				"company": "company",
				"posting_date": "posting_date",
				"due_date": "due_date",
				"customer_address": "service_address",
				"cost_center": "cost_center",
				"project": "project",
				"currency": "currency",
				"serial_no": "serial_no",
				"preferred_date_1": "preferred_date_1",
				"preferred_time": "preferred_time",
				"preference_note": "preference_note",
			},
		}
	}
	doc = get_mapped_doc("Service Request", source_name, mapping, target_doc)
	return doc
