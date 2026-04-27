# Copyright (c) 2026, ALITECS Alexander Leisentritt and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class ServiceReport(Document):
	def before_submit(self):
		self.status = "Submitted"

	def before_cancel(self):
		self.status = "Draft"

	def validate(self):
		self._validate_appointment_submitted()

	def _validate_appointment_submitted(self):
		if self.service_appointment:
			docstatus = frappe.db.get_value("Service Appointment", self.service_appointment, "docstatus")
			if docstatus != 1:
				frappe.throw(_("Reports can only be created for submitted Service Appointments."))
