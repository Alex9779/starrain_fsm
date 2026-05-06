import frappe


def execute():
	"""Set status = 'Cancelled' for all Service Requests that are cancelled (docstatus = 2)
	but still carry a non-Cancelled status value."""
	frappe.db.sql(
		"""
		UPDATE `tabService Request`
		SET status = 'Cancelled'
		WHERE docstatus = 2
		  AND status != 'Cancelled'
		"""
	)
