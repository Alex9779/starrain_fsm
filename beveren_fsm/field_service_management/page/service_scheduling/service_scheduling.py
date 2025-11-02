import frappe
from frappe.utils import get_datetime, getdate


@frappe.whitelist()
def get_schedule_data(selected_date):
	# Fetch Technicians
	technicians = frappe.get_all("Service Technician", fields=["name", "full_name"])

	# Convert selected_date to a date object
	selected_date = getdate(selected_date)

	# Fetch Service Appointments for the selected date
	appointments = frappe.get_all(
		"Service Appointment",
		filters={
			"posting_date": selected_date,
		},
		fields=[
			"name",
			"posting_date",
			"service_order",
			"scheduled_start_datetime",
			"scheduled_finish_datetime",
		],
	)

	# Get metadata for Service Appointment to fetch workflow states and their colors
	meta = frappe.get_meta("Service Appointment")

	appointments_with_technicians = []
	for appointment in appointments:
		# Get the full document to access child table and status.
		appointment_doc = frappe.get_doc("Service Appointment", appointment.name)

		# Fetch service technicians from child table
		service_technicians = [
			frappe.get_doc("Service Technician", tech.service_technician).name
			for tech in appointment_doc.service_technicians
		]

		# Convert scheduled datetime fields to proper datetime objects
		start_time = get_datetime(appointment_doc.scheduled_start_datetime)
		finish_time = get_datetime(appointment_doc.scheduled_finish_datetime)

		# Get the color for the current state using meta.states
		state_color = None
		if meta.states:
			for s in meta.states:
				if s.title == appointment_doc.status:
					state_color = s.color
					break

		# Prepare the structured appointment data
		structured_appointment = {
			"name": appointment.name,
			"service_order": appointment.service_order,
			"start_time": start_time.strftime("%H:%M"),
			"finish_time": finish_time.strftime("%H:%M"),
			"service_technicians": service_technicians,
			"status": appointment_doc.status,
			"color": state_color,
		}
		appointments_with_technicians.append(structured_appointment)

	return {"technicians": technicians, "appointments": appointments_with_technicians}


@frappe.whitelist()
def create_service_appointment(
	selected_date, service_order, scheduled_start_datetime, scheduled_finish_datetime, technician
):
	# This function only creates a new appointment if one does NOT already exist
	# for the same posting date, service order, scheduled times, and where the specified technician exists.

	# Convert the datetime strings to datetime objects.
	scheduled_start_datetime = get_datetime(scheduled_start_datetime)
	scheduled_finish_datetime = get_datetime(scheduled_finish_datetime)

	# Search for an existing Service Appointment using the main filters.
	appointment_list = frappe.get_all(
		"Service Appointment",
		filters={
			"posting_date": getdate(selected_date),
			"service_order": service_order,
			"scheduled_start_datetime": scheduled_start_datetime,
			"scheduled_finish_datetime": scheduled_finish_datetime,
		},
		limit=10,
	)

	found = None
	for app in appointment_list:
		app_doc = frappe.get_doc("Service Appointment", app.name)
		# Check if the technician is in the child table.
		for row in app_doc.get("service_technicians"):
			if row.service_technician == technician:
				found = app_doc
				break
		if found:
			break

	if found:
		appointment = found
	else:
		# Create a new Service Appointment.
		appointment = frappe.new_doc("Service Appointment")
		appointment.posting_date = getdate(selected_date)
		appointment.service_order = service_order
		appointment.scheduled_start_datetime = scheduled_start_datetime
		appointment.scheduled_finish_datetime = scheduled_finish_datetime
		appointment.append("service_technicians", {"service_technician": technician})
		appointment.save()
		appointment.submit()

	# Get metadata to fetch the workflow state color.
	meta = frappe.get_meta("Service Appointment")
	state_color = None
	if meta.states:
		for s in meta.states:
			if s.title == appointment.status:
				state_color = s.color
				break

	return {"name": appointment.name, "status": appointment.status, "color": state_color}


@frappe.whitelist()
def update_service_appointment(
	appointment_id,
	selected_date,
	service_order,
	scheduled_start_datetime,
	scheduled_finish_datetime,
	technician,
):
	appointment = frappe.get_doc("Service Appointment", appointment_id)

	appointment.update(
		{
			"posting_date": getdate(selected_date),
			"service_order": service_order,
			"scheduled_start_datetime": get_datetime(scheduled_start_datetime),
			"scheduled_finish_datetime": get_datetime(scheduled_finish_datetime),
		}
	)

	# Clear existing technicians and add the new one.
	appointment.set("service_technicians", [])
	appointment.append("service_technicians", {"service_technician": technician})

	appointment.save()
	return appointment.name


@frappe.whitelist()
def start_work(appointment_id):
	appointment = frappe.get_doc("Service Appointment", appointment_id)
	if appointment.status == "Dispatched":
		appointment.status = "In Progress"
		appointment.save(ignore_permissions=True)
		return appointment.name
	else:
		frappe.throw("Appointment is not in Dispatched status. Cannot start work.")
