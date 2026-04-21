import json

import frappe


@frappe.whitelist()
def create_service_invoice(docname, doctype, customer, items=None):
	items = json.loads(items) if items else []
	invoice = frappe.new_doc("Sales Invoice")
	invoice.customer = customer
	invoice.due_date = frappe.utils.nowdate()
	invoice.custom_reference_service_doctype = doctype
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


def _get_service_doc(doc):
	"""Return the service document referenced by a Sales Invoice."""
	ref_doctype = doc.get("custom_reference_service_doctype")
	ref_docname = doc.get("custom_reference_service_document")
	if not ref_doctype or not ref_docname:
		return None
	return frappe.get_doc(ref_doctype, ref_docname)


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

	service_doc = _get_service_doc(doc)
	if not service_doc:
		return

	updated = False
	for row in service_doc.get("items", []):
		if row.item_code not in invoice_item_codes:
			continue
		invoiced_qty = invoice_item_codes[row.item_code]
		row.invoiced_qty += invoiced_qty
		if row.qty > invoiced_qty > 0:
			row.invoice_status = "Partly Invoiced"
		elif row.qty == invoiced_qty:
			row.invoice_status = "Invoiced"
		updated = True

	if updated:
		service_doc.save()

	update_associated_docs_invoice_status(doc, method)


def update_associated_docs_invoice_status(doc, method):
	if not doc.custom_reference_service_document:
		return

	ref_doctype = doc.get("custom_reference_service_doctype")
	source_doc = _get_service_doc(doc)
	if not source_doc:
		return

	source_items = source_doc.get("items", [])

	if ref_doctype == "Service Appointment":
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
	elif ref_doctype == "Service Order":
		# Propagate to all appointments on this order
		appointments = frappe.get_all(
			"Service Appointment",
			filters={"service_order": source_doc.name},
			pluck="name",
		)
		for appointment_name in appointments:
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

	ref_doctype = doc.get("custom_reference_service_doctype")
	ref_doc = _get_service_doc(doc)
	if not ref_doc:
		return

	if ref_doctype == "Service Appointment":
		_apply_per_billed(ref_doc)
		order_name = ref_doc.get("service_order")
	elif ref_doctype == "Service Order":
		order_name = ref_doc.name
	else:
		return

	if order_name:
		order_doc = frappe.get_doc("Service Order", order_name)
		_apply_per_billed(order_doc)

		# Propagate further to the linked Service Quotation
		quotation_name = order_doc.get("service_quotation")
		if quotation_name:
			quotation_doc = frappe.get_doc("Service Quotation", quotation_name)
			_apply_per_billed(quotation_doc)

