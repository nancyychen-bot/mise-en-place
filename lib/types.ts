export type Platform = 'resy' | 'opentable';
export type LogType = 'check' | 'found' | 'notify' | 'system';
export type NtfyPriority = 'min' | 'low' | 'default' | 'high' | 'max';
export type DaysOfWeek = 'all' | 'weekdays' | 'weekends' | 'sat' | 'fri-sun';

export interface User {
  id: string;
  email: string;
  displayName: string | null;
}

export interface UserSettings {
  userId: string;
  resyApiKey: string | null;
  ntfyTopic: string | null;
  ntfyPriority: NtfyPriority;
  monitoringEnabled: boolean;
  earliestTime: string;       // "18:00"
  latestTime: string;         // "20:00"
  dayRange: number;           // 14
  daysOfWeek: DaysOfWeek;
  checkIntervalMin: number;   // 5
  activeHoursStart: string;
  activeHoursEnd: string;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface Restaurant {
  id: string;
  userId: string;
  name: string;
  platform: Platform;
  venueId: string;
  venueSlug: string | null;
  partySize: number;
  active: boolean;
  lastChecked: Date | null;
  createdAt: Date;
}

export interface Slot {
  date: string;         // "2026-04-22"
  time: string;         // "19:00" (24h)
  displayTime: string;  // "7:00 PM"
  type?: string;        // "Dining Room" etc.
  bookingToken?: string;
}

export interface CheckResult {
  restaurantId: string;
  restaurantName: string;
  platform: Platform;
  slots: Slot[];
  checkedAt: Date;
  error?: string;
}

export interface ActivityLogItem {
  id: string;
  userId: string;
  restaurantId: string | null;
  type: LogType;
  message: string;
  createdAt: Date;
}
