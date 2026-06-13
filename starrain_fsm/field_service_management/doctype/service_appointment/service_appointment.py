# Copyright (c) 2025, Beveren Software and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from starrain_fsm.field_service_management.utils.address_util import get_address_details, get_contact_details


class ServiceAppointment(Document):
	# Define missing attributes
	status: str
	amended_from: str
	service_order: str
	customer_address: str
	contact_person: str
	items: list

	def after_insert(self):
		self.set_service_order_status()

	def before_cancel(self):
		self.status = "Cancelled"

	def before_submit(self):
		self.validate_overlap()
		self.set_scheduled_status()
		self.set_service_order_status()

	def validate(self):
		if self.amended_from and self.status in ("Cancelled", "Completed"):
			self.status = "Open"
		self.validate_items()
		self.validate_technicians()
		self.set_scheduled_status()
		self.refresh_address_contact_details()

	def before_update_after_submit(self):
		# Only check overlap when rescheduling — not when marking as Completed/Cancelled
		if self.status not in ("Completed", "Cancelled"):
			self.validate_overlap()
		# Only validate the Service Report on the transition TO Completed,
		# not on subsequent saves of an already-completed appointment
		if self.status == "Completed":
			old_doc = self.get_doc_before_save()
			if not old_doc or old_doc.status != "Completed":
				self._validate_submitted_report()
		self.refresh_address_contact_details()

	def _validate_submitted_report(self):
		submitted = frappe.db.count(
			"Service Report",
			filters={"service_appointment": self.name, "docstatus": 1},
		)
		if not submitted:
			frappe.throw(
				_("At least one submitted Service Report is required before completing this appointment.")
			)

	def refresh_address_contact_details(self):
		if self.customer_address:
			self.address_details = get_address_details(self.customer_address).get("details", "")
		if self.contact_person:
			self.contact_details = get_contact_details(self.contact_person).get("details", "")

	def on_update_after_submit(self):
		self._log_items_changes()
		self.update_service_order_status()

	def _log_items_changes(self):
		old_doc = self.get_doc_before_save()
		if not old_doc:
			return

		def _to_map(items):
			result = {}
			for row in items or []:
				if not row.item_code:
					continue
				if row.item_code in result:
					result[row.item_code]["qty"] += row.qty
				else:
					result[row.item_code] = {
						"qty": row.qty,
						"rate": row.rate,
						"label": row.item_name or row.item_code,
					}
			return result

		old_map = _to_map(old_doc.get("items"))
		new_map = _to_map(self.get("items"))
		all_codes = sorted(set(old_map) | set(new_map))

		lines = []
		for code in all_codes:
			label = (new_map.get(code) or old_map.get(code))["label"]
			if code not in old_map:
				lines.append(_("Added <b>{0}</b> &mdash; qty: {1}").format(label, new_map[code]["qty"]))
			elif code not in new_map:
				lines.append(_("Removed <b>{0}</b>").format(label))
			else:
				old_row, new_row = old_map[code], new_map[code]
				changes = []
				if old_row["qty"] != new_row["qty"]:
					changes.append(_("qty: {0} &rarr; {1}").format(old_row["qty"], new_row["qty"]))
				if old_row["rate"] != new_row["rate"]:
					changes.append(_("rate: {0} &rarr; {1}").format(old_row["rate"], new_row["rate"]))
				if changes:
					lines.append("<b>{0}</b>: {1}".format(label, ", ".join(changes)))

		if lines:
			message = "<b>{0}</b><br>{1}".format(
				_("Items updated"),
				"<br>".join("&bull; {0}".format(l) for l in lines),
			)
			self.add_comment("Edit", message)

	def on_cancel(self):
		self.cancel_linked_order()

	def validate_items(self):
		if not self.items:
			frappe.throw(_("Please add at least one item"))

	def validate_technicians(self):
		if not self.get("service_technicians"):
			frappe.throw(_("Please add at least one technician"))

	def validate_overlap(self):
		# Collect all parent Service Appointments tied to the same technicians
		child_parents = frappe.get_all(
			"Service Technician Item",
			filters={"service_technician": ["in", [d.service_technician for d in self.service_technicians]]},
			pluck="parent",
		)

		filters = [
			["name", "!=", self.name],
			["name", "in", child_parents],
			["docstatus", "!=", 2],
			["status", "not in", ["Closed", "Cancelled"]],
			["scheduled_start_datetime", "<", self.scheduled_finish_datetime],
			["scheduled_finish_datetime", ">", self.scheduled_start_datetime],
		]

		overlapping_basic = frappe.get_all(
			"Service Appointment",
			filters=filters,
			fields=["name", "scheduled_start_datetime", "scheduled_finish_datetime"],
		)
		conflicting = overlapping_basic
		if conflicting:
			# Build a more specific error mentioning the first conflicting appointment and overlapping technicians
			self_tech_ids = {d.service_technician for d in self.service_technicians}
			first = None
			first_overlap_techs = []

			for cand in conflicting:
				cand_doc = frappe.get_doc("Service Appointment", cand.name)
				cand_tech_ids = {d.service_technician for d in cand_doc.get("service_technicians")}
				common = list(self_tech_ids.intersection(cand_tech_ids))
				if common:
					first = cand
					# Map tech ids to full names where possible
					id_to_name = {
						d.service_technician: getattr(d, "full_name", d.service_technician)
						for d in cand_doc.get("service_technicians")
					}
					first_overlap_techs = [id_to_name.get(tid, tid) for tid in common]
					break
			# Fallback: if we didn't find intersecting technicians (shouldn't happen), still throw a basic error
			if not first:
				frappe.throw(_("There is an overlap with another appointment"))
				return
			tech_list = ", ".join(first_overlap_techs) if first_overlap_techs else _("assigned technicians")
			msg = _("Overlap with appointment {apt} ({start} - {end}) for technician(s): {techs}").format(
				apt=first.name,
				start=first.scheduled_start_datetime,
				end=first.scheduled_finish_datetime,
				techs=tech_list,
			)

			frappe.throw(msg)

	def set_scheduled_status(self):
		if self.scheduled_start_datetime and self.scheduled_finish_datetime:
			if self.get("service_technicians") and len(self.get("service_technicians")) > 0:
				self.status = "Scheduled"
			elif self.status == "Open":
				self.status = "Scheduled"

	def set_service_order_status(self):
		if self.service_order:
			frappe.db.set_value("Service Order", self.service_order, "status", "Scheduled")

	def update_service_order_status(self):
		self._sync_order_status()

	def cancel_linked_order(self):
		self._sync_order_status()

	def _sync_order_status(self):
		"""Derive the Service Order status from all its appointments.

		Rules (evaluated in priority order):
		  1. Any appointment is Scheduled or In Progress → order is Scheduled
		  2. All non-cancelled appointments are Completed (≥1 exists) → order is Completed
		  3. All appointments are cancelled → order reverts to Open
		"""
		if not self.service_order:
			return

		appointments = frappe.db.get_all(
			"Service Appointment",
			filters={"service_order": self.service_order},
			fields=["name", "status", "docstatus"],
		)

		# Exclude cancelled docs (docstatus 2) — they carry no weight
		active = [a for a in appointments if a.docstatus != 2]

		if not active:
			# Every appointment has been cancelled — revert order to Open
			frappe.db.set_value("Service Order", self.service_order, "status", "Open")
			return

		statuses = {a.status for a in active}

		if statuses & {"Scheduled", "In Progress"}:
			# At least one appointment is still active
			new_status = "Scheduled"
		elif statuses <= {"Completed"}:
			# All non-cancelled appointments are completed
			new_status = "Completed"
		else:
			# Mixed states (e.g. some Open) — keep as Scheduled
			new_status = "Scheduled"

		frappe.db.set_value("Service Order", self.service_order, "status", new_status)


@frappe.whitelist()
def make_appointment_from_order(source_name, target_doc=None, selected_items=None):
	def postprocess(source, target):
		target.naming_series = "SA-.YYYY.-"
		target.posting_date = frappe.utils.today()
		target.due_date = source.due_date
		if target.customer_address:
			target.address_details = get_address_details(target.customer_address).get("details", "")
		if target.contact_person:
			target.contact_details = get_contact_details(target.contact_person).get("details", "")

	mapping = {
		"Service Order": {
			"doctype": "Service Appointment",
			"field_map": {
				"name": "service_order",
				"service_request": "service_request",
				"service_quotation": "service_quotation",
				"customer": "customer",
				"company": "company",
				"type": "type",
				"priority": "priority",
				"customer_address": "customer_address",
				"contact_person": "contact_person",
				"cost_center": "cost_center",
				"project": "project",
				"currency": "currency",
				"serial_no": "serial_no",
			},
		},
		"Service Order Item": {
			"doctype": "Service Appointment Item",
			"field_map": {
				"item_code": "item_code",
				"description": "description",
				"qty": "qty",
				"rate": "rate",
				"amount": "amount",
			},
			"add_if_empty": True,
		},
		"Service Technician Item": {
			"doctype": "Service Technician Item",
			"field_map": {
				"service_technician": "service_technician",
			},
			"add_if_empty": True,
		},
	}
	doc = get_mapped_doc("Service Order", source_name, mapping, target_doc, postprocess)
	return doc


@frappe.whitelist()
def split_appointment_by_technicians(appointment_name=None, technician_ids=None):
	"""Move selected technicians from an appointment into a duplicated appointment."""
	if not appointment_name:
		appointment_name = frappe.form_dict.get("appointment_name")

	if isinstance(technician_ids, str):
		technician_ids = frappe.parse_json(technician_ids)

	if not appointment_name:
		frappe.throw(_("Service Appointment is required"))

	if not isinstance(technician_ids, list | tuple) or not technician_ids:
		frappe.throw(_("Please select at least one technician"))

	appointment = frappe.get_doc("Service Appointment", appointment_name)

	if appointment.docstatus == 2 or appointment.status == "Cancelled":
		frappe.throw(_("Cannot split a cancelled appointment"))

	if appointment.status == "Completed":
		frappe.throw(_("Cannot split a completed appointment"))

	if not appointment.has_permission("write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if not frappe.has_permission("Service Appointment", "create"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	assigned_rows = [d for d in appointment.get("service_technicians") if d.service_technician]
	if len(assigned_rows) < 2:
		frappe.throw(_("At least two technicians are required to split an appointment"))

	selected_ids = list(dict.fromkeys([d for d in technician_ids if d]))
	assigned_ids = [d.service_technician for d in assigned_rows]

	invalid = [tech for tech in selected_ids if tech not in assigned_ids]
	if invalid:
		frappe.throw(
			_("These technicians are not assigned to this appointment: {0}").format(
				", ".join(invalid)
			)
		)

	remaining_rows = [d for d in assigned_rows if d.service_technician not in selected_ids]
	selected_rows = [d for d in assigned_rows if d.service_technician in selected_ids]

	if not selected_rows:
		frappe.throw(_("Please select at least one technician"))

	if not remaining_rows:
		frappe.throw(_("At least one technician must remain on the original appointment"))

	# Copy from the original first, then reassign technician rows on both docs.
	new_appointment = frappe.copy_doc(appointment)
	new_appointment.set("service_technicians", [])
	for tech in selected_rows:
		new_appointment.append(
			"service_technicians",
			{
				"service_technician": tech.service_technician,
				"full_name": tech.full_name,
			},
		)

	appointment.set("service_technicians", [])
	for tech in remaining_rows:
		appointment.append(
			"service_technicians",
			{
				"service_technician": tech.service_technician,
				"full_name": tech.full_name,
			},
		)

	appointment.save()

	new_appointment.insert()
	if appointment.docstatus == 1:
		new_appointment.submit()

	return {
		"original_appointment": appointment.name,
		"new_appointment": new_appointment.name,
	}
