import { z } from "zod";
import { APP_CONFIG, VIBE_TAGS } from "@/config/app";
import { getState } from "@/config/nigeria";

/** Handles: 3–20 chars; letters, numbers, underscores and dots. Unique case-insensitively (DB index). */
export const handleSchema = z
  .string()
  .trim()
  .min(APP_CONFIG.HANDLE_MIN, `At least ${APP_CONFIG.HANDLE_MIN} characters`)
  .max(APP_CONFIG.HANDLE_MAX, `At most ${APP_CONFIG.HANDLE_MAX} characters`)
  .regex(/^[A-Za-z0-9_.]+$/, "Only letters, numbers, underscores and dots");

/** Whole years between a YYYY-MM-DD date of birth and `now`. */
export function ageOn(dob: string, now: Date = new Date()): number {
  const [y, m, d] = dob.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  const month = now.getUTCMonth() + 1;
  if (month < m || (month === m && now.getUTCDate() < d)) age -= 1;
  return age;
}

export function isMinor(dob: string, now: Date = new Date()): boolean {
  return ageOn(dob, now) < APP_CONFIG.ADULT_AGE;
}

/** Can a person with this dob see / buy an event with this minimum age? (0 = all ages) */
export function meetsAgeLimit(dob: string, ageMin: number, now: Date = new Date()): boolean {
  return ageOn(dob, now) >= ageMin;
}

const dobSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a real date")
  .refine(
    (v) => ageOn(v) >= APP_CONFIG.MIN_SIGNUP_AGE,
    `You must be at least ${APP_CONFIG.MIN_SIGNUP_AGE} to use Detty`,
  )
  .refine((v) => ageOn(v) < 120, "Enter a real date");

export const onboardingSchema = z
  .object({
    handle: handleSchema,
    displayName: z.string().trim().min(1, "Enter a display name").max(40),
    dob: dobSchema,
    homeState: z.string().min(1, "Pick your state"),
    homeCity: z.string().trim().min(1, "Pick your city").max(60),
    bio: z.string().trim().max(160).default(""),
    pronouns: z.string().trim().max(20).optional(),
    vibeTags: z.array(z.enum(VIBE_TAGS)).max(8).default([]),
  })
  .refine((v) => Boolean(getState(v.homeState)), {
    path: ["homeState"],
    message: "Pick a Nigerian state",
  });

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

/** Nigerian mobile numbers, normalised to E.164 (+234XXXXXXXXXX). */
export function normaliseNgPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  const m = digits.match(/^(?:\+?234|0)([789][01]\d{8})$/);
  return m ? `+234${m[1]}` : null;
}
