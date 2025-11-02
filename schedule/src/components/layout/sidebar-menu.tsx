"use client";

import { Home, Calendar, Users, Settings, BarChart3 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useState } from "react";

interface MenuItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
}

const menuItems: MenuItem[] = [
  { icon: Home, label: "Home", active: true },
  { icon: Calendar, label: "Schedule" },
  { icon: BarChart3, label: "Reports" },
  { icon: Users, label: "Technicians" },
  { icon: Settings, label: "Settings" },
];

export function SidebarMenu() {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  return (
    <div className="h-full w-16 border-r border-border flex flex-col items-center py-4 gap-2 group/sidebar bg-gradient-to-b from-primary/60 via-primary/45 to-primary/30">
      {menuItems.map((item) => {
        const Icon = item.icon;
        const isHovered = hoveredItem === item.label;

        return (
          <div
            key={item.label}
            className="relative"
            onMouseEnter={() => setHoveredItem(item.label)}
            onMouseLeave={() => setHoveredItem(null)}
          >
            <button
              className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center transition-colors",
                item.active
                  ? "bg-primary text-white shadow-md"
                  : "hover:bg-primary/20 text-muted-foreground hover:text-foreground hover:bg-primary/30"
              )}
            >
              <Icon className="h-5 w-5" />
            </button>

            {/* Tooltip on hover */}
            {isHovered && (
              <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-popover border border-border rounded-md shadow-lg z-50 whitespace-nowrap">
                <span className="text-sm font-medium">{item.label}</span>
                {/* Arrow */}
                <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-r-4 border-r-border"></div>
                <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent border-r-[7px] border-r-popover ml-[1px]"></div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
