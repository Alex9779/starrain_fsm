import { Home, LayoutPanelLeft, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavbarProps {
  viewType: "gantt" | "calendar";
  setViewType: (viewType: "gantt" | "calendar") => void;
}

export default function Navbar({ viewType, setViewType }: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center border-b bg-background px-6">
      <a href="/app/service" className="flex items-center gap-2 hover:text-primary">
        <Home className="h-5 w-5" />
        <span className="font-medium">Home</span>
      </a>
      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center rounded-lg border bg-card p-1">
          <Button
            variant={viewType === "gantt" ? "secondary" : "ghost"}
            size="sm"
            className="flex items-center gap-2"
            onClick={() => setViewType("gantt")}
          >
            <LayoutPanelLeft className="h-4 w-4" />
            <span>Gantt</span>
          </Button>
          <Button
            variant={viewType === "calendar" ? "secondary" : "ghost"}
            size="sm"
            className="flex items-center gap-2"
            onClick={() => setViewType("calendar")}
          >
            <CalendarIcon className="h-4 w-4" />
            <span>Calendar</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
