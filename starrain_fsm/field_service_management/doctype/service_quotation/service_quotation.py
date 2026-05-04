# Copyright (c) 2025, Beveren Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from starrain_fsm.field_service_management.utils.address_util import get_address_details, get_contact_details


class ServiceQuotation(Document):
	def validate(self):
		if self.amended_from and self.status == "Cancelled":
			self.status = "Open"
		self.refresh_address_contact_details()

	def refresh_address_contact_details(self):
		if self.service_address:
			self.address_details = get_address_details(self.service_address).get("details", "")
		if self.contact_person:
			self.contact_details = get_contact_details(self.contact_person).get("details", "")

	def before_submit(self):
		if self.service_request:
			request = frappe.get_doc("Service Request", self.service_request)
			request.status = "Quotation"
			request.save()

	def before_cancel(self):
		self.status = "Cancelled"

	def on_cancel(self):
		self.cancel_linked_request()

	def cancel_linked_request(self):
		if not self.service_request:
			return
		request = frappe.get_doc("Service Request", self.service_request)
		request.status = "Open"
		self.service_request = ""
		request.save()


@frappe.whitelist()
def make_service_quotation(source_name, target_doc=None, selected_items=None):
	def postprocess(source, target):
		target.naming_series = "SQ-.YYYY.-"
		target.posting_date = frappe.utils.today()
		if target.service_address:
			target.address_details = get_address_details(target.service_address).get("details", "")
		if target.contact_person:
			target.contact_details = get_contact_details(target.contact_person).get("details", "")

	mapping = {
		"Service Request": {
			"doctype": "Service Quotation",
			"field_map": {
				"name": "service_request",
				"customer": "party_name",
				"company": "company",
				"due_date": "due_date",
				"customer_address": "service_address",
				"contact_person": "contact_person",
				"cost_center": "cost_center",
				"project": "project",
				"currency": "currency",
				"serial_no": "serial_no",
				"preferred_date_1": "preferred_date_1",
				"preferred_date_2": "preferred_date_2",
				"preferred_time": "preferred_time",
				"preference_note": "preference_note",
			},
		}
	}
	doc = get_mapped_doc("Service Request", source_name, mapping, target_doc, postprocess)
	return doc


@frappe.whitelist()
def make_quotation_from_appointment(source_name, target_doc=None):
	def postprocess(source, target):
		target.naming_series = "SQ-.YYYY.-"
		target.posting_date = frappe.utils.today()
		if target.service_address:
			target.address_details = get_address_details(target.service_address).get("details", "")
		if target.contact_person:
			target.contact_details = get_contact_details(target.contact_person).get("details", "")

	mapping = {
		"Service Appointment": {
			"doctype": "Service Quotation",
			"field_map": {
				"customer": "party_name",
				"company": "company",
				"currency": "currency",
				"cost_center": "cost_center",
				"project": "project",
				"customer_address": "service_address",
				"contact_person": "contact_person",
				"serial_no": "serial_no",
			},
		},
		"Service Order Item": {
			"doctype": "Service Quotation Item",
			"field_map": {
				"item_code": "item_code",
				"description": "description",
				"qty": "qty",
				"rate": "rate",
			},
			"add_if_empty": True,
		},
	}
	doc = get_mapped_doc("Service Appointment", source_name, mapping, target_doc, postprocess)
	return doc


@frappe.whitelist()
def make_quotation_from_order(source_name, target_doc=None):
	def postprocess(source, target):
		target.naming_series = "SQ-.YYYY.-"
		target.posting_date = frappe.utils.today()
		if target.service_address:
			target.address_details = get_address_details(target.service_address).get("details", "")
		if target.contact_person:
			target.contact_details = get_contact_details(target.contact_person).get("details", "")

	mapping = {
		"Service Order": {
			"doctype": "Service Quotation",
			"field_map": {
				"customer": "party_name",
				"company": "company",
				"type": "type",
				"priority": "priority",
				"due_date": "due_date",
				"customer_address": "service_address",
				"contact_person": "contact_person",
				"cost_center": "cost_center",
				"project": "project",
				"currency": "currency",
				"serial_no": "serial_no",
				"preferred_date_1": "preferred_date_1",
				"preferred_date_2": "preferred_date_2",
				"preferred_time": "preferred_time",
				"preference_note": "preference_note",
			},
		},
		"Service Order Item": {
			"doctype": "Service Quotation Item",
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
	doc = get_mapped_doc("Service Order", source_name, mapping, target_doc, postprocess)
	return doc
