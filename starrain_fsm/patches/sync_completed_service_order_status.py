import frappe


def execute():
	"""Mark Service Orders as Completed where every non-cancelled Service Appointment
	is already Completed (and at least one exists)."""

	# Fetch all submitted Service Orders that are not already Completed or Cancelled
	orders = frappe.get_all(
		"Service Order",
		filters={"docstatus": 1, "status": ["not in", ["Completed", "Cancelled"]]},
		pluck="name",
	)

	completed = []
	for order_name in orders:
		appointments = frappe.db.get_all(
			"Service Appointment",
			filters={"service_order": order_name},
			fields=["name", "status", "docstatus"],
		)

		# Active = not cancelled at the doctype level
		active = [a for a in appointments if a.docstatus != 2]

		if not active:
			continue

		statuses = {a.status for a in active}
		if statuses <= {"Completed"}:
			completed.append(order_name)

	if completed:
		frappe.db.sql(
			f"""
			UPDATE `tabService Order`
			SET status = 'Completed'
			WHERE name IN ({', '.join(['%s'] * len(completed))})
			""",
			completed,
		)
		frappe.db.commit()
		print(f"Marked {len(completed)} Service Order(s) as Completed: {', '.join(completed)}")
