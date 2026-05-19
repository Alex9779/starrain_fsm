import frappe
from frappe.utils import getdate, nowdate


@frappe.whitelist()
def get_service_orders_for_tracking(
	status=None,
	start_date=None,
	end_date=None,
	search=None,
	limit_page_length: int | None = 50,
):
	filters = {"docstatus": ["!=", 2]}

	if status and status != "all":
		filters["status"] = status

	if start_date and end_date:
		filters["posting_date"] = ["between", [getdate(start_date), getdate(end_date)]]
	elif start_date:
		filters["posting_date"] = [">=", getdate(start_date)]
	elif end_date:
		filters["posting_date"] = ["<=", getdate(end_date)]

	or_filters = []
	if search:
		search_term = f"%{search.strip()}%"
		or_filters = [
			["Service Order", "name", "like", search_term],
			["Service Order", "customer", "like", search_term],
			["Service Order", "serial_no", "like", search_term],
			["Service Order", "item_code", "like", search_term],
		]

	fields = [
		"name",
		"customer",
		"status",
		"posting_date",
		"due_date",
		"serial_no",
		"item_code",
		"priority",
		"type",
	]

	limit = int(limit_page_length) if limit_page_length else None

	orders = frappe.get_all(
		"Service Order",
		filters=filters,
		or_filters=or_filters,
		fields=fields,
		order_by="posting_date desc",
		limit_page_length=limit,
	)

	return orders


def create_sales_invoice_from_order(order_name):
    """Create a Sales Invoice from a completed Service Order."""
    order = frappe.get_doc("Service Order", order_name)

    if getattr(order, "status", None) != "Completed":
        frappe.throw("Sales Invoice can only be created from a completed Service Order.")

    invoice = frappe.new_doc("Sales Invoice")
    invoice.customer = getattr(order, "customer", None)
    invoice.due_date = nowdate()
    invoice.custom_reference_service_doctype = "Service Order"
    invoice.custom_reference_service_document = order_name

    for item in getattr(order, "items", []):
        invoice.append("items", {
            "item_code": item.get("item_code"),
            "qty": item.get("qty"),
            "rate": item.get("rate"),
        })

    invoice.insert()
    return invoice.name

@frappe.whitelist()
def reopen_service_order(order_name):
    """Reopen a completed Service Order by creating a new Service Appointment."""
    order = frappe.get_doc("Service Order", order_name)

    if order.status != "Completed":
        frappe.throw("Only completed Service Orders can be reopened.")

    order.status = "Scheduled"
    order.save()
    frappe.db.commit()

    return order.name
