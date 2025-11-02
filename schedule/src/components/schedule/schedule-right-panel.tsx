"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import { CalendarIcon, BarChart3, Map, Calendar as CalendarIcon2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "../../lib/utils";
import { Appointment } from "../../pages/schedule/types";
import { GanttView } from "./gantt-view";
import { MapsView } from "./maps-view";
import { AppointmentDetailSheet } from "./appointment-detail-sheet";

interface ScheduleRightPanelProps {
  appointments: Appointment[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  viewType: "gantt" | "grid" | "maps" | "calendar";
  onViewTypeChange: (view: "gantt" | "grid" | "maps" | "calendar") => void;
  selectedAppointment: Appointment | null;
  onAppointmentSelect: (appointment: Appointment | null) => void;
  onRefresh: () => void;
}

export function ScheduleRightPanel({
  appointments,
  selectedDate,
  onDateChange,
  viewType,
  onViewTypeChange,
  selectedAppointment,
  onAppointmentSelect,
  onRefresh,
}: ScheduleRightPanelProps) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const isToday = format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  const handleDateNavigation = (direction: "prev" | "next") => {
    const newDate = new Date(selectedDate);
    if (direction === "prev") {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    onDateChange(newDate);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Section 1: View Type Switcher (Top) */}
      <div className="border-b border-border p-4 bg-gradient-to-b from-primary/30 via-primary/15 to-primary/5">
        <div className="flex items-center gap-2">
          <Button
            variant={viewType === "gantt" ? "default" : "outline"}
            size="sm"
            onClick={() => onViewTypeChange("gantt")}
            className="gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            Gantt
          </Button>
          <Button
            variant={viewType === "grid" ? "default" : "outline"}
            size="sm"
            onClick={() => onViewTypeChange("grid")}
            className="gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            Grid
          </Button>
          <Button
            variant={viewType === "maps" ? "default" : "outline"}
            size="sm"
            onClick={() => onViewTypeChange("maps")}
            className="gap-2"
          >
            <Map className="h-4 w-4" />
            Maps
          </Button>
          <Button
            variant={viewType === "calendar" ? "default" : "outline"}
            size="sm"
            onClick={() => onViewTypeChange("calendar")}
            className="gap-2"
          >
            <CalendarIcon2 className="h-4 w-4" />
            Calendar
          </Button>
        </div>
      </div>

      {/* Section 2: Date Selection and Options */}
      <div className="border-b border-border p-4 bg-card">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDateNavigation("prev")}
          >
            ←
          </Button>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[240px] justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? (
                  <span>
                    {format(selectedDate, "EEEE, MMMM d, yyyy")}
                    {isToday && <span className="ml-2 text-xs text-muted-foreground">(Today)</span>}
                  </span>
                ) : (
                  <span>Pick a date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    onDateChange(date);
                    setDatePickerOpen(false);
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDateNavigation("next")}
          >
            →
          </Button>
        </div>
      </div>

      {/* Section 3: View Content (includes technician search and Gantt) */}
      <div className="flex-1 overflow-hidden">
        {viewType === "gantt" && (
          <GanttView
            appointments={appointments}
            selectedDate={selectedDate}
            onAppointmentClick={onAppointmentSelect}
          />
        )}
        {viewType === "maps" && (
          <MapsView
            appointments={appointments}
            selectedDate={selectedDate}
            onAppointmentClick={onAppointmentSelect}
          />
        )}
        {viewType === "grid" && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Grid view coming soon...
          </div>
        )}
        {viewType === "calendar" && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Calendar view coming soon...
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      {selectedAppointment && (
        <AppointmentDetailSheet
          appointment={selectedAppointment}
          open={!!selectedAppointment}
          onOpenChange={(open) => !open && onAppointmentSelect(null)}
        />
      )}
    </div>
  );
}