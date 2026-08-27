import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class lists safely — later classes win over earlier
 * conflicting ones instead of just concatenating (e.g. variant classes
 * overriding a default padding).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
