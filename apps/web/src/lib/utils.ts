import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(firstName: string, lastName: string) {
  return `${firstName[0]}${lastName[0]}`.toUpperCase();
}

export function getUtilizationColor(pct: number) {
  if (pct <= 50) return 'bg-emerald-500';
  if (pct <= 75) return 'bg-amber-500';
  if (pct <= 90) return 'bg-orange-500';
  return 'bg-red-500';
}

export function getUtilizationTextColor(pct: number) {
  if (pct <= 50) return 'text-emerald-700';
  if (pct <= 75) return 'text-amber-700';
  if (pct <= 90) return 'text-orange-700';
  return 'text-red-700';
}
