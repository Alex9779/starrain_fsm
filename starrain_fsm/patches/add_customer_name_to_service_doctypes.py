import frappe


def execute():
	doctypes = [
		"Service Appointment",
		"Service Order",
		"Service Report",
		"Service Request",
	]
	for doctype in doctypes:
		if not frappe.db.has_column(doctype, "customer_name"):
			continue
		table = f"tab{doctype}"
		frappe.db.sql(
			f"""
			UPDATE `{table}` t
			INNER JOIN `tabCustomer` c ON c.name = t.customer
			SET t.customer_name = c.customer_name
			WHERE t.customer IS NOT NULL
			  AND t.customer != ''
			  AND (t.customer_name IS NULL OR t.customer_name = '')
			"""
		)
		frappe.db.commit()
