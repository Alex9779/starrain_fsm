import frappe


def execute():
	"""
	Migrate existing Service Appointment items from tabService Order Item
	to the new tabService Appointment Item child table.
	"""
	if not frappe.db.table_exists("Service Appointment Item"):
		return

	# Fetch all appointment items still sitting in tabService Order Item
	rows = frappe.db.sql(
		"""
		SELECT
			name, parent, parentfield, parenttype, idx,
			item_code, item_name, description,
			qty, uom, rate, amount,
			item_tax_template, warehouse,
			is_billable, is_service, additional_notes
		FROM `tabService Order Item`
		WHERE parenttype = 'Service Appointment'
		""",
		as_dict=True,
	)

	if not rows:
		return

	for row in rows:
		frappe.db.insert(
			"Service Appointment Item",
			{
				"name": frappe.generate_hash(),
				"parent": row.parent,
				"parentfield": "items",
				"parenttype": "Service Appointment",
				"idx": row.idx,
				"item_code": row.item_code,
				"item_name": row.item_name,
				"description": row.description,
				"qty": row.qty,
				"uom": row.uom,
				"rate": row.rate,
				"amount": row.amount,
				"item_tax_template": row.item_tax_template,
				"warehouse": row.warehouse,
				"is_billable": row.is_billable,
				"is_service": row.is_service,
				"additional_notes": row.additional_notes,
			},
		)

	# Remove the migrated rows from the old table
	frappe.db.sql(
		"DELETE FROM `tabService Order Item` WHERE parenttype = 'Service Appointment'"
	)

	frappe.db.commit()
