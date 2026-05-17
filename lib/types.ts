export type Platform = 'resy' | 'opentable' | 'sevenrooms';
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
  resyAuthToken: string | null;
  opentableSession: string | null;
  sevenroomsAuthToken: string | null;
  tokenExpired: Record<string, boolean>;
}

export interface Restaurant {
  id: string;
  userId: string;
  name: string;
  platform: Platform;
  venueId: string;
  venueSlug: string | null;
  venueCity: string | null;   // Resy city slug e.g. 'ny', 'chi', 'la'
  partySize: number;          // legacy single size
  partySizes: number[] | null; // multi-size override; falls back to [partySize]
  active: boolean;
  lastChecked: Date | null;
  createdAt: Date;
  earliestTime: string | null;
  latestTime: string | null;
  dayRange: number | null;
  dateStart: string | null;  // "YYYY-MM-DD"
  dateEnd: string | null;    // "YYYY-MM-DD"
  autoBook: boolean;
  preferredTime: string | null; // "19:30" (24h)
  releaseDaysAhead: number | null;
  releaseTime: string | null;   // "09:00" (24h)
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
