import json
from datetime import datetime

import frappe


@frappe.whitelist()
def create_appointment_from_api(
	posting_date,
	service_order,
	customer,
	scheduled_start_datetime,
	scheduled_finish_datetime,
	service_technicians,
	items,
	changed_status=None,
):
	appointment = frappe.new_doc("Service Appointment")
	appointment.posting_date = posting_date if posting_date else datetime.now().date()
	appointment.service_order = service_order
	appointment.customer = customer
	appointment.scheduled_start_datetime = scheduled_start_datetime
	appointment.scheduled_finish_datetime = scheduled_finish_datetime

	for item in items:
		appointment.append(
			"items",
			{
				"item_code": item["item_code"],
				"qty": item["qty"],
				"rate": item["rate"],
				"amount": item["amount"],
			},
		)

	if isinstance(service_technicians, list):
		for service_technician in service_technicians:
			appointment.append(
				"service_technicians",
				{
					"service_technician": service_technician["service_technician"],
					"full_name": service_technician["full_name"],
					# "service_area": service_technician["service_area"],
					# "specialization": service_technician["specialization"]
				},
			)
	else:
		appointment.append(
			"service_technicians",
			{
				"service_technician": service_technicians["service_technician"],
				"full_name": service_technicians["full_name"],
				# "service_area": service_technician["service_area"],
				# "specialization": service_technician["specialization"]
			},
		)

	appointment.insert()
	appointment.submit()

	if changed_status == "Dispatched":
		appointment.status = "Dispatched"
		appointment.save()
	return appointment.name


@frappe.whitelist()
def update_appointment_from_api(
	name,
	scheduled_start_datetime,
	scheduled_finish_datetime,
	service_technicians,
	items,
	changed_status=None,
	reschedule=False,
	edit_item_list=False,
	edit_technician_list=False,
):
	# if all(not flag for flag in (reschedule, edit_item_list, edit_technician_list)) and changed_status is None:
	# 	return

	if not reschedule and not edit_item_list and not edit_technician_list and changed_status is None:
		return

	appointment = frappe.get_doc("Service Appointment", name)

	if edit_item_list:
		appointment.items = []
		for item in items:
			appointment.append(
				"items",
				{
					"item_code": item["item_code"],
					"qty": item["qty"],
					"rate": item["rate"],
					"amount": item["amount"],
				},
			)

	if edit_technician_list:
		appointment.service_technicians = []
		if isinstance(service_technicians, list):
			for service_technician in service_technicians:
				appointment.append(
					"service_technicians",
					{
						"service_technician": service_technician["service_technician"],
						"full_name": service_technician["full_name"],
						# "service_area": service_technician["service_area"],
						# "specialization": service_technician["specialization"]
					},
				)
		else:
			appointment.append(
				"service_technicians",
				{
					"service_technician": service_technicians["service_technician"],
					"full_name": service_technicians["full_name"],
					# "service_area": service_technician["service_area"],
					# "specialization": service_technician["specialization"]
				},
			)

	if reschedule:
		appointment.scheduled_start_datetime = scheduled_start_datetime
		appointment.scheduled_finish_datetime = scheduled_finish_datetime

	if changed_status:
		if changed_status != "Cancelled":
			appointment.status = changed_status
		else:
			appointment.cancel()

	appointment.save()
	return appointment.name
