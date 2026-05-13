import frappe


def execute():
	if not frappe.db.has_column("Service Quotation", "customer_name"):
		return
	frappe.db.sql(
		"""
		UPDATE `tabService Quotation` t
		INNER JOIN `tabCustomer` c ON c.name = t.party_name
		SET t.customer_name = c.customer_name
		WHERE t.quotation_to = 'Customer'
		  AND t.party_name IS NOT NULL
		  AND t.party_name != ''
		  AND (t.customer_name IS NULL OR t.customer_name = '')
		"""
	)
	frappe.db.commit()
