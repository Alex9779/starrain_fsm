# Copyright (c) 2025, Beveren Software and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt


class ServiceOrder(Document):
	def validate(self):
		self.set_in_words()
		self.validate_items()

	def before_submit(self):
		self.update_linked_doc_status_before_submit()

	def on_update_after_submit(self):
		self.update_linked_doc_status_after_submit()

	def on_cancel(self):
		self.cancel_linked_request()
		self.cancel_linked_quotation()

	def validate_items(self):
		if not self.get("items"):
			frappe.throw(_("Please add at least one item"))

	def update_linked_doc_status_before_submit(self):
		if not self.service_quotation and not self.service_request:
			return
		if self.service_request and self.service_quotation:
			quotation = frappe.get_doc("Service Quotation", self.service_quotation)
			request = frappe.get_doc("Service Request", self.service_request)
			# Convert Request
			request.status = "Converted"
			request.save()
			# Order Quote
			quotation.status = "Ordered"
			quotation.save()
		elif self.service_request and not self.service_quotation:
			request = frappe.get_doc("Service Request", self.service_request)
			request.status = "Converted"
			request.save()
		elif self.service_quotation and not self.service_request:
			quotation = frappe.get_doc("Service Quotation", self.service_quotation)
			quotation.status = "Ordered"
			quotation.save()

	def update_linked_doc_status_after_submit(self):
		if not self.service_quotation:
			return
		quotation = frappe.get_doc("Service Quotation", self.service_quotation)
		is_allowed_status = self.status in ["Scheduled", "Dispatched", "In Progress", "Completed", "Review"]
		quotation_not_converted = quotation.status != "Converted"
		if is_allowed_status and quotation_not_converted:
			quotation.status = "Converted"
			quotation.save()

	def cancel_linked_quotation(self):
		if not self.service_quotation:
			return
		quote = frappe.get_doc("Service Quotation", self.service_quotation)
		quote.status = "Open"
		self.service_quotation = ""
		quote.save()

	def cancel_linked_request(self):
		if not self.service_request:
			return
		request = frappe.get_doc("Service Request", self.service_request)
		request.status = "Open"
		self.service_request = ""
		request.save()

	@frappe.whitelist()
	def create_appointment(self, service_order):
		appointment = frappe.new_doc("Service Appointment")
		appointment.service_order = service_order
		appointment.customer = self.customer

		for item in self.items:
			appointment.append(
				"items",
				{
					"item_code": item.item_code,
					"qty": item.qty,
					"rate": item.rate,
					"amount": item.amount,
					"invoice_status": item.invoice_status,
				},
			)
		appointment.insert()
		return appointment.name

	def set_in_words(self):
		from frappe.utils import money_in_words

		self.in_words = money_in_words(self.grand_total, self.currency)
		self.base_in_words = money_in_words(
			self.base_grand_total, frappe.get_cached_value("Company", self.company, "default_currency")
		)


@frappe.whitelist()
def make_order_from_request(source_name, target_doc=None, selected_items=None):
	mapping = {
		"Service Request": {
			"doctype": "Service Order",
			"field_map": {
				"name": "service_request",
				"customer": "customer",
				"company": "company",
				"posting_date": "posting_date",
				"due_date": "due_date",
				"customer_address": "customer_address",
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


@frappe.whitelist()
def make_order_from_quote(source_name, target_doc=None, selected_items=None):
	mapping = {
		"Service Quotation": {
			"doctype": "Service Order",
			"field_map": {
				"name": "service_quotation",
				"party_name": "customer",
				"company": "company",
				"type": "type",
				"priority": "priority",
				"due_date": "due_date",
				"service_address": "customer_address",
				"cost_center": "cost_center",
				"project": "project",
				"currency": "currency",
				"serial_no": "serial_no",
				"preferred_date_1": "preferred_date_1",
				"preferred_time": "preferred_time",
				"preference_note": "preference_note",
			},
		},
		"Service Quotation Item": {
			"doctype": "Service Order Item",
			"field_map": {
				"item_code": "item_code",
				"description": "description",
				"qty": "qty",
				"rate": "rate",
				"amount": "amount",
			},
			"add_if_empty": True,
		},
	}
	doc = get_mapped_doc("Service Quotation", source_name, mapping, target_doc)
	return doc
