import {
  Heart,
  BookOpen,
  Droplet,
  Wheat,
  Building2,
  Zap,
  Leaf,
  Landmark,
  HeartHandshake,
  TrendingUp,
  Apple,
  Users,
  Settings,
  Megaphone,
  Briefcase,
  Scale,
  Banknote,
  GraduationCap,
  Stethoscope,
  Home,
  Truck,
  Shield,
  Globe,
  Lightbulb,
  Wrench,
  Circle,
  type LucideIcon,
} from "lucide-react";

/**
 * Central icon registry for sectors
 * Maps icon key strings to Lucide icon components
 * 
 * IMPORTANT: icon field in database stores the KEY (e.g., "heart"), not the component
 */
export const sectorIconMap: Record<string, LucideIcon> = {
  // Core sectors
  "heart": Heart,
  "book-open": BookOpen,
  "droplet": Droplet,
  "wheat": Wheat,
  "building-2": Building2,
  "zap": Zap,
  "leaf": Leaf,
  "landmark": Landmark,
  "heart-handshake": HeartHandshake,
  "trending-up": TrendingUp,
  
  // Additional sectors
  "apple": Apple,
  "users": Users,
  "settings": Settings,
  "megaphone": Megaphone,
  "briefcase": Briefcase,
  "scale": Scale,
  "banknote": Banknote,
  "graduation-cap": GraduationCap,
  "stethoscope": Stethoscope,
  "home": Home,
  "truck": Truck,
  "shield": Shield,
  "globe": Globe,
  "lightbulb": Lightbulb,
  "wrench": Wrench,
  
  // Fallback
  "circle": Circle,
};

/**
 * List of all available icon keys for CMS dropdown selection
 */
export const availableIconKeys = Object.keys(sectorIconMap).filter(k => k !== "circle");

/**
 * Get the icon component for a given icon key
 * Returns Circle as fallback if not found
 */
export function getSectorIcon(iconKey: string | null | undefined): LucideIcon {
  if (!iconKey) return Circle;
  const normalizedKey = iconKey.toLowerCase().trim();
  return sectorIconMap[normalizedKey] || Circle;
}

/**
 * Check if an icon key is valid
 */
export function isValidIconKey(iconKey: string): boolean {
  const normalizedKey = iconKey.toLowerCase().trim();
  return normalizedKey in sectorIconMap;
}

/**
 * Format icon key for display (e.g., "heart-handshake" -> "Heart Handshake")
 */
export function formatIconKeyForDisplay(iconKey: string): string {
  return iconKey
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}