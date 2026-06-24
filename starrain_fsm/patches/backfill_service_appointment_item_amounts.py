import frappe


def execute():
	"""Backfill stored Service Appointment item amounts for existing records."""
	if not frappe.db.table_exists("Service Appointment Item"):
		return

	frappe.db.sql(
		"""
		UPDATE `tabService Appointment Item`
		SET amount = IFNULL(qty, 0) * IFNULL(rate, 0)
		WHERE parenttype = 'Service Appointment'
		""",
	)
	frappe.db.commit()
