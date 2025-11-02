import frappe
from frappe.model.document import Document
from frappe.utils import add_days, getdate, today


@frappe.whitelist()
def get_address_details(customer_address):
	address_doc = frappe.get_doc("Address", customer_address)
	address_parts = [
		str(address_doc.get(field))
		for field in ["address_line1", "address_line2", "city", "county", "state", "country", "pincode"]
		if address_doc.get(field)
	]
	address = ", ".join(address_parts)
	email_id = address_doc.email_id
	phone = address_doc.phone

	details = address
	if email_id:
		details += "\nEmail: " + email_id
	if phone:
		details += "\nPhone: " + phone

	return {"details": details}


@frappe.whitelist()
def get_contact_details(customer_contact):
	contact_doc = frappe.get_doc("Contact", customer_contact)
	full_name_parts = [
		contact_doc.get(field)
		for field in ["first_name", "middle_name", "last_name"]
		if contact_doc.get(field)
	]
	full_name = " ".join(full_name_parts)
	email_id = contact_doc.email_id
	mobile_no = contact_doc.mobile_no
	phone = contact_doc.phone

	details = ""
	if full_name:
		details += "Name: " + full_name
	if email_id:
		details += ("\n" if details else "") + "Email: " + email_id
	if mobile_no:
		details += ("\n" if details else "") + "Mobile: " + mobile_no
	if phone:
		details += ("\n" if details else "") + "Phone: " + phone

	return {"details": details}
