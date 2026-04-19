import json

import frappe


@frappe.whitelist()
def create_service_invoice(docname, customer, items=None):
	items = json.loads(items) if items else []
	invoice = frappe.new_doc("Sales Invoice")
	invoice.customer = customer
	invoice.due_date = frappe.utils.nowdate()
	invoice.custom_reference_service_document = docname
	for item in items:
		invoice.append(
			"items",
			{
				"item_code": item["item_code"],
				"qty": item["qty"],
				"rate": item["rate"],
				"amount": item["amount"],
			},
		)
	invoice.insert()
	return invoice.name


def update_invoice_status(doc, method):
	if not doc.custom_reference_service_document:
		return

	new_status = "Invoiced" if method == "on_submit" else "Not Invoiced"

	# Retrieve all item codes from the Sales Invoice
	invoice_item_codes = {
		item["item_code"]: item["qty"]
		for item in frappe.get_all(
			"Sales Invoice Item", filters={"parent": doc.name}, fields=["item_code", "qty"]
		)
	}

	# Load the referenced Service Appointment
	service_doc = frappe.get_doc("Service Appointment", doc.custom_reference_service_document)

	updated = False
	child_tables = ["items"]
	for table in child_tables:
		if not hasattr(service_doc, table):
			frappe.throw(f"No '{table}' child table found in Service Appointment")

		for row in getattr(service_doc, table):
			invoiced_qty = invoice_item_codes[row.item_code]
			if row.item_code in invoice_item_codes.keys():
				row.invoiced_qty += invoiced_qty
				if row.invoice_status != new_status:
					if row.qty > invoiced_qty > 0:
						row.invoice_status = "Partly Invoiced"
					if row.qty == invoiced_qty:
						row.invoice_status = "Invoiced"

					updated = True

	if updated:
		service_doc.save()
		frappe.msgprint(
			f"Updated invoice status for <strong>Services and Parts</strong> in "
			f"<strong>Service Appointment</strong> {doc.custom_reference_service_document}"
		)

	update_associated_docs_invoice_status(doc, method)


def update_associated_docs_invoice_status(doc, method):
	if not doc.custom_reference_service_document:
		return

	source_doc = frappe.get_doc("Service Appointment", doc.custom_reference_service_document)
	source_items = source_doc.get("items", [])

	# Propagate to the linked Service Order
	if source_doc.service_order:
		update_target_documents("Service Order", source_doc.service_order, source_items)

	# Propagate to other appointments on the same order
	if source_doc.service_order:
		similar_appointments = frappe.get_all(
			"Service Appointment",
			filters={"service_order": source_doc.service_order, "name": ["!=", source_doc.name]},
			pluck="name",
		)
		for appointment_name in similar_appointments:
			update_target_documents("Service Appointment", appointment_name, source_items)


def update_target_documents(target_doctype, target_docname, source_items):
	target_doc = frappe.get_doc(target_doctype, target_docname)

	# Build a lookup for items in the target document by item_code
	target_items_lookup = {row.item_code: row for row in target_doc.get("items", [])}

	updated = False
	for item in source_items:
		target_row = target_items_lookup.get(item.item_code)
		# Update only if the invoice status is different from the source's current status
		if target_row and target_row.invoice_status != item.invoice_status:
			target_row.invoice_status = item.invoice_status
			target_row.invoiced_qty = item.invoiced_qty
			updated = True

	if updated:
		target_doc.save()
		frappe.msgprint(
			f"Updated invoice status for <strong>Services and Parts</strong> in "
			f"<strong>{target_doctype}</strong> {target_docname}"
		)


def _apply_per_billed(doc):
	total_amount = 0.0
	billed_amount = 0.0

	for item in doc.get("items", []):
		full_amount = item.amount or 0.0
		total_amount += full_amount

		invoiced_qty = item.get("invoiced_qty", 0)
		item_qty = item.qty or 0
		proportion_invoiced = (invoiced_qty / item_qty) if item_qty else 0

		billed_amount += full_amount * proportion_invoiced

	doc.per_billed = (billed_amount / total_amount) * 100 if total_amount else 0.0
	doc.save()


def update_per_billed_status(doc, method):
	if not doc.custom_reference_service_document:
		return

	ref_doc = frappe.get_doc("Service Appointment", doc.custom_reference_service_document)
	_apply_per_billed(ref_doc)

	# Propagate to the linked Service Order
	order_name = ref_doc.get("service_order")
	if order_name:
		order_doc = frappe.get_doc("Service Order", order_name)
		_apply_per_billed(order_doc)

		# Propagate further to the linked Service Quotation
		quotation_name = order_doc.get("service_quotation")
		if quotation_name:
			quotation_doc = frappe.get_doc("Service Quotation", quotation_name)
			_apply_per_billed(quotation_doc)

