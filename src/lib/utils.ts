import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format integer kobo as naira, e.g. 1500000 -> "₦15,000". */
export function formatNaira(kobo: number): string {
  const naira = Math.trunc(kobo / 100);
  const rem = Math.abs(kobo % 100);
  const base = `₦${naira.toLocaleString("en-NG")}`;
  return rem === 0 ? base : `${base}.${String(rem).padStart(2, "0")}`;
}
