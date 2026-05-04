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
		frappe.db.sql(
			"""
			INSERT INTO `tabService Appointment Item`
				(name, parent, parentfield, parenttype, idx,
				 item_code, item_name, description,
				 qty, uom, rate, amount,
				 item_tax_template, warehouse,
				 is_billable, is_service, additional_notes,
				 creation, modified, modified_by, owner, docstatus)
			VALUES
				(%(name)s, %(parent)s, 'items', 'Service Appointment', %(idx)s,
				 %(item_code)s, %(item_name)s, %(description)s,
				 %(qty)s, %(uom)s, %(rate)s, %(amount)s,
				 %(item_tax_template)s, %(warehouse)s,
				 %(is_billable)s, %(is_service)s, %(additional_notes)s,
				 NOW(), NOW(), 'Administrator', 'Administrator', 0)
			""",
			{
				"name": frappe.generate_hash(),
				"parent": row.parent,
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
