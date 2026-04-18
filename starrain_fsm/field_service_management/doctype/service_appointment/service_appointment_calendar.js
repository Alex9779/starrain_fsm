frappe.views.calendar["Service Appointment"] = {
	field_map: {
		start: "scheduled_start_datetime",
		end: "scheduled_finish_datetime",
		id: "name",
		title: "name",
		allDay: 0,
		progress: "per_billed",
		secondary_status: "status",
	},
	style_map: {
		Scheduled: "blue",
		Completed: "green",
		Cancelled: "red",
	},
	get_events_method: "frappe.desk.calendar.get_events",
	filters: [
		{
			fieldtype: "Link",
			fieldname: "service_technician",
			options: "Service Technician",
			label: __("Technician"),
		},
	],
};
