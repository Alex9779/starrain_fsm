import { Appointment } from "../pages/schedule/types";

export async function fetchAppointmentsWithFilter(
  startDate: Date | null,
  endDate: Date | null,
  status?: string
): Promise<Appointment[]> {
  try {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfToken = (window as any).csrf_token;

    // Build query parameters
    const params = new URLSearchParams();

    if (startDate) {
      params.append("start_date", startDate.toISOString().split("T")[0]);
    }
    if (endDate) {
      params.append("end_date", endDate.toISOString().split("T")[0]);
    }

    if (status && status !== "all") {
      params.append("status", status);
    }

    const url = `/api/method/beveren_fsm.field_service_management.api.service_appointment.get_appointments?${params.toString()}`;

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": csrfToken,
    };

    const response = await fetch(url, {
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch appointments: ${response.statusText}`);
    }

    const result = await response.json();

    // Frappe API methods return data in result.message
    const appointments = result.message || [];

        //eslint-disable-next-line @typescript-eslint/no-explicit-any
    return appointments.map((apt: any) => ({
      ...apt,
      service_technicians: apt.service_technicians || [],
    }));
  } catch (error) {
    console.error("Error fetching appointments:", error);
    throw error;
  }
}

/**
 * Fetch a single appointment by name
 */
export async function fetchAppointment(name: string): Promise<Appointment> {
  try {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfToken = (window as any).csrf_token;
    const url = `/api/method/beveren_fsm.field_service_management.api.service_appointment.get_appointment?name=${encodeURIComponent(name)}`;

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": csrfToken,
    };

    const response = await fetch(url, {
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch appointment: ${response.statusText}`);
    }

    const result = await response.json();

    // Frappe API methods return data in result.message
    return result.message || null;
  } catch (error) {
    console.error("Error fetching appointment:", error);
    throw error;
  }
}

/**
 * Get available appointment statuses
 */
export async function fetchAppointmentStatuses(): Promise<string[]> {
  try {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfToken = (window as any).csrf_token;
    const url = `/api/method/beveren_fsm.field_service_management.api.service_appointment.get_appointment_statuses`;

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": csrfToken,
    };

    const response = await fetch(url, {
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch statuses: ${response.statusText}`);
    }

    const result = await response.json();

    // Frappe API methods return data in result.message
    return result.message || [];
  } catch (error) {
    console.error("Error fetching appointment statuses:", error);
    throw error;
  }
}

    //eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchTechnicians(): Promise<any[]> {
  try {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfToken = (window as any).csrf_token;
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": csrfToken,
    };

    const response = await fetch(
      '/api/resource/Service Technician?fields=["name","full_name","employee","service_area","specialization"]&limit_page_length=0',
      {
        headers,
        credentials: "include",
      }
    );
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("Error fetching technicians:", error);
    throw error;
  }
}

export async function bulkAssignTechnicians(
  appointmentIds: string[],
  technicianIds: string[]
): Promise<void> {
  try {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfToken = (window as any).csrf_token;
    const payload = {
      appointment_ids: appointmentIds,
      technician_ids: technicianIds,
    };

    const response = await fetch(
      "/api/method/beveren_fsm.field_service_management.api.schedule.bulk_assign_technicians",
      {
        method: "POST",
        headers: {
          "X-Frappe-CSRF-Token": csrfToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "include",
      }
    );

    if (!response.ok) {
      throw new Error("Failed to assign technicians");
    }
  } catch (error) {
    console.error("Error assigning technicians:", error);
    throw error;
  }
}

export async function bulkRemoveTechnicians(appointmentIds: string[]): Promise<void> {
  try {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csrfToken = (window as any).csrf_token;
    const payload = {
      appointment_ids: appointmentIds,
    };

    const response = await fetch(
      "/api/method/beveren_fsm.field_service_management.api.schedule.bulk_remove_technicians",
      {
        method: "POST",
        headers: {
          "X-Frappe-CSRF-Token": csrfToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "include",
      }
    );

    if (!response.ok) {
      throw new Error("Failed to remove technicians");
    }
  } catch (error) {
    console.error("Error removing technicians:", error);
    throw error;
  }
}
