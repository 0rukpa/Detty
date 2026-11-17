/** Product rules that are config constants in the spec. */
export const APP_CONFIG = {
  MIN_SIGNUP_AGE: 13, // open question 1: default 13
  ADULT_AGE: 18,
  PLUG_MIN_AGE: 18,
  HANDLE_MIN: 3,
  HANDLE_MAX: 20,
  CERTIFIED_MIN_RATINGS: 100, // must have MORE than this many ratings
  CERTIFIED_MIN_AVG: 4.0, // and an average ABOVE this
  MIN_EXTRA_CHECKS: 1, // of {social code, venue proof, vendor co-sign}
  ESCROW_RELEASE: "event_start" as "event_start" | "event_end_plus_24h",
  AUTO_PAUSE_REPORTS: 3,
  RATING_WINDOW_HOURS: 72,
  LOUNGE_OPEN_DAYS_AFTER_EVENT: 7,
  CHECKOUT_HOLD_MINUTES: 10,
  STYLIST_DAILY_MESSAGES: 30,
  GBEDU_CAN_BUY_TICKETS: false, // open question 2: default no
} as const;

export const VIBE_TAGS = [
  "Afrobeats",
  "Amapiano",
  "Alté",
  "Rave",
  "Chill",
  "Owambe",
  "Brunch",
  "Hip-Hop",
  "Afro House",
  "Street-Hop",
  "Highlife",
  "Games",
  "Beach",
] as const;

export const EVENT_CATEGORIES = [
  "party",
  "rave",
  "picnic",
  "day_party",
  "beach",
  "concert",
  "owambe",
  "game_night",
  "brunch",
  "other",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  party: "Party",
  rave: "Rave",
  picnic: "Picnic",
  day_party: "Day party",
  beach: "Beach",
  concert: "Concert",
  owambe: "Owambe",
  game_night: "Game night",
  brunch: "Brunch",
  other: "Other",
};

/** Preset for Detty Travel mode. Month is 0-indexed. */
export const DETTY_DECEMBER = { startMonth: 11, startDay: 15, endMonth: 0, endDay: 5 } as const;
