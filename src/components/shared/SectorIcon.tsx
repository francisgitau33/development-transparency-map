"use client";

import { getSectorIcon } from "@/lib/icons/sector-icons";
import { cn } from "@/lib/utils";

interface SectorIconProps {
  iconKey: string | null | undefined;
  color?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  withBackground?: boolean;
}

const sizeMap = {
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
  xl: "w-8 h-8",
};

const bgSizeMap = {
  xs: "w-5 h-5",
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-10 h-10",
  xl: "w-12 h-12",
};

/**
 * SectorIcon - Renders a sector icon with consistent styling
 * 
 * @param iconKey - The icon key string (e.g., "heart", "book-open")
 * @param color - Hex color to apply to the icon
 * @param size - Size preset: xs, sm, md, lg, xl
 * @param className - Additional CSS classes
 * @param withBackground - Whether to render with a colored background circle
 */
export function SectorIcon({
  iconKey,
  color,
  size = "md",
  className,
  withBackground = false,
}: SectorIconProps) {
  const IconComponent = getSectorIcon(iconKey);
  
  if (withBackground) {
    return (
      <div
        data-design-id={`sector-icon-bg-${iconKey || "fallback"}`}
        className={cn(
          "rounded-full flex items-center justify-center flex-shrink-0",
          bgSizeMap[size],
          className
        )}
        style={{ backgroundColor: color ? `${color}20` : "#e5e7eb" }}
      >
        <IconComponent
          className={sizeMap[size]}
          style={{ color: color || "#6b7280" }}
        />
      </div>
    );
  }

  return (
    <IconComponent
      data-design-id={`sector-icon-${iconKey || "fallback"}`}
      className={cn(sizeMap[size], className)}
      style={{ color: color || "currentColor" }}
    />
  );
}

/**
 * SectorBadge - Renders a sector with icon, name, and optional color indicator
 */
interface SectorBadgeProps {
  iconKey: string | null | undefined;
  name: string;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function SectorBadge({
  iconKey,
  name,
  color,
  size = "md",
  className,
}: SectorBadgeProps) {
  const textSizeMap = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  const iconSizeMap = {
    sm: "xs" as const,
    md: "sm" as const,
    lg: "md" as const,
  };

  return (
    <div
      data-design-id={`sector-badge-${iconKey || "fallback"}`}
      className={cn(
        "inline-flex items-center gap-1.5",
        textSizeMap[size],
        className
      )}
    >
      <SectorIcon iconKey={iconKey} color={color} size={iconSizeMap[size]} />
      <span className="text-slate-700">{name}</span>
    </div>
  );
}

/**
 * SectorLegendItem - Renders a legend item with colored dot and sector info
 */
interface SectorLegendItemProps {
  iconKey: string | null | undefined;
  name: string;
  color: string;
  className?: string;
}

export function SectorLegendItem({
  iconKey,
  name,
  color,
  className,
}: SectorLegendItemProps) {
  return (
    <div
      data-design-id={`sector-legend-item-${iconKey || "fallback"}`}
      className={cn("flex items-center gap-2 text-sm", className)}
    >
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <SectorIcon iconKey={iconKey} color={color} size="sm" />
      <span className="text-slate-700">{name}</span>
    </div>
  );
}