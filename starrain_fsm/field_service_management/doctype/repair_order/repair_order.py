# Copyright (c) 2025, Beveren Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class RepairOrder(Document):
	def before_submit(self):
		self.posting_date = frappe.utils.nowdate()
