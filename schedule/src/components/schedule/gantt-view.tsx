"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "../ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Appointment } from "../../pages/schedule/types";
import { fetchTechnicians } from "../../hooks/use-appointments";
import { format, startOfDay } from "date-fns";
import { cn } from "../../lib/utils";

interface GanttViewProps {
  appointments: Appointment[];
  selectedDate: Date;
  onAppointmentClick?: (appointment: Appointment) => void;
  technicianSearch?: string;
}

interface Technician {
  name: string;
  full_name: string;
}

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i); // 0-23
const DEFAULT_START_HOUR = 6; // 6am
const DEFAULT_END_HOUR = 18; // 6pm
const HOUR_HEIGHT = 60; // pixels per hour

export function GanttView({
  appointments,
  selectedDate,
  onAppointmentClick,
  technicianSearch = "",
}: GanttViewProps) {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleStartHour, setVisibleStartHour] = useState(DEFAULT_START_HOUR);
  const [visibleEndHour, setVisibleEndHour] = useState(DEFAULT_END_HOUR);

  useEffect(() => {
    loadTechnicians();
  }, []);

  const loadTechnicians = async () => {
    try {
      const data = await fetchTechnicians();
      setTechnicians(data);
    } catch (error) {
      console.error("Error loading technicians:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter technicians by search
  const filteredTechnicians = useMemo(() => {
    if (!technicianSearch.trim()) return technicians;
    const searchLower = technicianSearch.toLowerCase();
    return technicians.filter(
      (tech) =>
        tech.full_name.toLowerCase().includes(searchLower) ||
        tech.name.toLowerCase().includes(searchLower)
    );
  }, [technicians, technicianSearch]);

  // Get technicians that have appointments for this date
  const techniciansWithAppointments = useMemo(() => {
    const techMap = new Map<string, Technician>();

    appointments.forEach((apt) => {
      apt.service_technicians?.forEach((tech) => {
        if (!techMap.has(tech.service_technician)) {
          const techData = filteredTechnicians.find((t) => t.name === tech.service_technician);
          if (techData) {
            techMap.set(tech.service_technician, techData);
          }
        }
      });
    });

    // Include filtered technicians even if they don't have appointments
    filteredTechnicians.forEach((tech) => {
      if (!techMap.has(tech.name)) {
        techMap.set(tech.name, tech);
      }
    });

    return Array.from(techMap.values());
  }, [appointments, filteredTechnicians]);

  const getAppointmentsForTechnician = (technicianName: string) => {
    return appointments.filter(
      (apt) =>
        apt.service_technicians?.some(
          (tech) => tech.service_technician === technicianName
        )
    );
  };

  const getAppointmentPosition = (appointment: Appointment) => {
    if (!appointment.scheduled_start_datetime || !appointment.scheduled_finish_datetime) {
      return { top: 0, height: 0, left: 0 };
    }

    const start = new Date(appointment.scheduled_start_datetime);
    const end = new Date(appointment.scheduled_finish_datetime);
    const dayStart = startOfDay(selectedDate);

    // Calculate position relative to day start
    const startMinutes = (start.getTime() - dayStart.getTime()) / (1000 * 60);
    const endMinutes = (end.getTime() - dayStart.getTime()) / (1000 * 60);
    const duration = endMinutes - startMinutes;

    const top = (startMinutes / 60) * HOUR_HEIGHT;
    const height = (duration / 60) * HOUR_HEIGHT;
    const left = 0;

    return { top, height, left };
  };

  const visibleHours = ALL_HOURS.slice(visibleStartHour, visibleEndHour + 1);
  const visibleHoursCount = visibleEndHour - visibleStartHour + 1;
  const rowHeight = visibleHoursCount * HOUR_HEIGHT;

  const canScrollLeft = visibleStartHour > 0;
  const canScrollRight = visibleEndHour < 23;

  const scrollLeft = () => {
    if (canScrollLeft) {
      const newStart = Math.max(0, visibleStartHour - 3);
      const hoursToShow = visibleEndHour - newStart + 1;
      if (hoursToShow > 12) {
        setVisibleStartHour(newStart);
        setVisibleEndHour(newStart + 11);
      } else {
        setVisibleStartHour(newStart);
      }
    }
  };

  const scrollRight = () => {
    if (canScrollRight) {
      const newEnd = Math.min(23, visibleEndHour + 3);
      const hoursToShow = newEnd - visibleStartHour + 1;
      if (hoursToShow > 12) {
        setVisibleStartHour(newEnd - 11);
        setVisibleEndHour(newEnd);
      } else {
        setVisibleEndHour(newEnd);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Gantt Content */}
      <div className="flex-1 overflow-auto relative">

        <div className="flex h-full">
          {/* Technician Names Column */}
          <div className="w-48 border-r border-border bg-card sticky left-0 z-10">
            <div className="sticky top-0 bg-card border-b border-border px-3 py-2 font-semibold text-sm">
              Technicians
            </div>
            <div className="divide-y divide-border">
              {loading ? (
                <div className="p-4 text-sm text-muted-foreground">Loading...</div>
              ) : techniciansWithAppointments.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  {technicianSearch ? "No technicians found" : "No technicians"}
                </div>
              ) : (
                techniciansWithAppointments.map((tech) => {
                  const techAppointments = getAppointmentsForTechnician(tech.name);
                  return (
                    <div
                      key={tech.name}
                      className="px-3 py-2 border-r border-border"
                      style={{ minHeight: `${rowHeight}px` }}
                    >
                      <div className="font-medium text-sm">{tech.full_name}</div>
                      {techAppointments.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {techAppointments.length} appointment
                          {techAppointments.length !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Timeline Grid */}
          <div className="flex-1 relative">
            {/* Time Column Headers with Scroll Arrows */}
            <div className="sticky top-0 bg-card border-b border-border z-20 flex relative items-center min-h-[40px]">
              {/* Left Arrow Button */}
              {canScrollLeft && (
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute left-1 top-1/2 -translate-y-1/2 z-30 bg-background shadow-md hover:shadow-lg h-7 w-7"
                  onClick={scrollLeft}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}

              {/* Time Labels */}
              <div className={cn("flex flex-1", canScrollLeft && "ml-10", canScrollRight && "mr-10")}>
                {visibleHours.map((hour) => (
                  <div
                    key={hour}
                    className="flex-1 border-r border-border px-2 py-2 text-center text-xs font-medium"
                    style={{ minWidth: "80px" }}
                  >
                    {hour.toString().padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {/* Right Arrow Button */}
              {canScrollRight && (
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 z-30 bg-background shadow-md hover:shadow-lg h-7 w-7"
                  onClick={scrollRight}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Technician Rows with Appointments */}
            <div className="relative">
              {techniciansWithAppointments.map((tech) => {
                const techAppointments = getAppointmentsForTechnician(tech.name);

                return (
                  <div
                    key={tech.name}
                    className="relative border-b border-border"
                    style={{ minHeight: `${rowHeight}px` }}
                  >
                    {/* Hour Grid Lines */}
                    <div className="absolute inset-0">
                      {visibleHours.map((hour, idx) => (
                        <div
                          key={hour}
                          className="absolute border-t border-border"
                          style={{
                            top: `${idx * HOUR_HEIGHT}px`,
                            width: "100%"
                          }}
                        />
                      ))}
                    </div>

                    {/* Appointments */}
                    {techAppointments.map((appointment) => {
                      const pos = getAppointmentPosition(appointment);

                      // Check if appointment is in visible range
                      const appointmentStartHour = appointment.scheduled_start_datetime
                        ? new Date(appointment.scheduled_start_datetime).getHours()
                        : -1;

                      if (
                        appointmentStartHour < visibleStartHour ||
                        appointmentStartHour > visibleEndHour
                      ) {
                        return null;
                      }

                      const statusColors: Record<string, string> = {
                        Open: "bg-primary/80",
                        Scheduled: "bg-primary/80",
                        Dispatched: "bg-orange-500",
                        "In Progress": "bg-secondary",
                        Completed: "bg-secondary",
                        Cancelled: "bg-gray-400",
                      };

                      const statusColor =
                        statusColors[appointment.status] || "bg-gray-500";

                      const startTime = appointment.scheduled_start_datetime
                        ? format(
                            new Date(appointment.scheduled_start_datetime),
                            "HH:mm"
                          )
                        : "";
                      const endTime = appointment.scheduled_finish_datetime
                        ? format(
                            new Date(appointment.scheduled_finish_datetime),
                            "HH:mm"
                          )
                        : "";

                      // Adjust position relative to visible hours
                      const adjustedTop = pos.top - (visibleStartHour * HOUR_HEIGHT);

                      return (
                        <div
                          key={appointment.name}
                          className={`absolute ${statusColor} text-white text-xs rounded px-2 py-1 cursor-pointer hover:opacity-90 transition-opacity border border-white/20 shadow-sm`}
                          style={{
                            top: `${Math.max(0, adjustedTop)}px`,
                            height: `${Math.max(pos.height, 30)}px`,
                            left: `${pos.left}px`,
                            minWidth: "120px",
                          }}
                          title={`${appointment.name} (${startTime} - ${endTime})`}
                          onClick={() => onAppointmentClick?.(appointment)}
                        >
                          <div className="font-medium truncate">
                            {appointment.service_order || appointment.name}
                          </div>
                          <div className="text-xs opacity-90">
                            {startTime} - {endTime}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
