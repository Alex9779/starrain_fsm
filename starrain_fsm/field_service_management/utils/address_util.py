import frappe


@frappe.whitelist()
def get_address_details(customer_address):
	address_doc = frappe.get_doc("Address", customer_address)
	address_parts = [
		str(address_doc.get(field))
		for field in ["address_line1", "address_line2", "city", "county", "state", "country", "pincode"]
		if address_doc.get(field)
	]

	lines = []
	if address_parts:
		lines.append("<p>" + "<br>".join(address_parts) + "</p>")
	if address_doc.phone:
		lines.append(f"<p><b>Phone:</b> {address_doc.phone}</p>")
	if address_doc.email_id:
		lines.append(f"<p><b>Email:</b> {address_doc.email_id}</p>")

	html = '<div class="address-box">' + "".join(lines) + "</div>"
	return {"details": html}


@frappe.whitelist()
def get_contact_details(contact_person):
	contact_doc = frappe.get_doc("Contact", contact_person)
	full_name_parts = [
		contact_doc.get(field)
		for field in ["first_name", "middle_name", "last_name"]
		if contact_doc.get(field)
	]
	full_name = " ".join(full_name_parts)

	lines = []
	if full_name:
		lines.append(f"<p><b>{full_name}</b></p>")
	if contact_doc.mobile_no:
		lines.append(f"<p><b>Mobile:</b> {contact_doc.mobile_no}</p>")
	if contact_doc.phone:
		lines.append(f"<p><b>Phone:</b> {contact_doc.phone}</p>")
	if contact_doc.email_id:
		lines.append(f"<p><b>Email:</b> {contact_doc.email_id}</p>")

	html = '<div class="address-box">' + "".join(lines) + "</div>"
	return {"details": html}


@frappe.whitelist()
def get_default_customer_address_and_contact(customer):
	from frappe.contacts.doctype.address.address import get_default_address
	from erpnext.accounts.party import get_default_contact

	address = get_default_address("Customer", customer)
	contact = get_default_contact("Customer", customer)
	return {"address": address, "contact": contact}
