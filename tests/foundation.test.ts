import { describe, expect, it } from "vitest";
import { FEES, gbdToKobo } from "@/config/fees";
import { distanceKm, getState, NIGERIAN_STATES } from "@/config/nigeria";
import {
  ageOn,
  handleSchema,
  isMinor,
  meetsAgeLimit,
  normaliseNgPhone,
  onboardingSchema,
} from "@/features/profiles/validation";
import { formatNaira } from "@/lib/utils";

describe("handles", () => {
  it("accepts letters, numbers, underscores and dots", () => {
    for (const h of ["tolu", "big_wiz.01", "A.b_C", "abc", "a".repeat(20)]) {
      expect(handleSchema.safeParse(h).success, h).toBe(true);
    }
  });
  it("rejects bad lengths and characters", () => {
    for (const h of ["ab", "a".repeat(21), "tolu!", "ada obi", "émeka", "@tolu", "naija-boy"]) {
      expect(handleSchema.safeParse(h).success, h).toBe(false);
    }
  });
});

describe("age rules", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  it("computes whole years", () => {
    expect(ageOn("2008-11-17", now)).toBe(18); // birthday today
    expect(ageOn("2008-11-18", now)).toBe(17); // birthday tomorrow
    expect(ageOn("2000-01-01", now)).toBe(26);
  });
  it("flags minors", () => {
    expect(isMinor("2008-11-18", now)).toBe(true);
    expect(isMinor("2008-11-17", now)).toBe(false);
  });
  it("gates events by age limit", () => {
    expect(meetsAgeLimit("2010-05-01", 0, now)).toBe(true); // all ages
    expect(meetsAgeLimit("2010-05-01", 16, now)).toBe(true);
    expect(meetsAgeLimit("2010-05-01", 18, now)).toBe(false);
    expect(meetsAgeLimit("2004-05-01", 21, now)).toBe(true);
  });
});

describe("onboarding", () => {
  const base = { handle: "tolu_a", displayName: "Tolu", dob: "2000-01-01", homeState: "Lagos", homeCity: "Yaba" };
  it("accepts a valid profile", () => {
    expect(onboardingSchema.safeParse(base).success).toBe(true);
  });
  it("rejects under-13s and unknown states", () => {
    const year = new Date().getUTCFullYear() - 10;
    expect(onboardingSchema.safeParse({ ...base, dob: `${year}-01-01` }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, homeState: "Wakanda" }).success).toBe(false);
  });
});

describe("Nigerian phone numbers", () => {
  it("normalises to E.164", () => {
    expect(normaliseNgPhone("0803 123 4567")).toBe("+2348031234567");
    expect(normaliseNgPhone("+234 803 123 4567")).toBe("+2348031234567");
    expect(normaliseNgPhone("2349012345678")).toBe("+2349012345678");
  });
  it("rejects invalid numbers", () => {
    expect(normaliseNgPhone("12345")).toBeNull();
    expect(normaliseNgPhone("0603 123 4567")).toBeNull();
  });
});

describe("states", () => {
  it("has all 36 states + FCT with unique codes", () => {
    expect(NIGERIAN_STATES).toHaveLength(37);
    expect(new Set(NIGERIAN_STATES.map((s) => s.code)).size).toBe(37);
    expect(NIGERIAN_STATES.every((s) => s.cities.length > 0)).toBe(true);
  });
  it("measures Lagos to Abuja at roughly 520 km", () => {
    const d = distanceKm(getState("Lagos")!, getState("FCT")!);
    expect(d).toBeGreaterThan(480);
    expect(d).toBeLessThan(560);
  });
});

describe("money", () => {
  it("keeps fees as integer kobo", () => {
    expect(gbdToKobo(FEES.ticketFeeGbd)).toBe(1_000); // ₦10
    expect(gbdToKobo(FEES.withdrawalFeeGbd)).toBe(10_000); // ₦100
    expect(gbdToKobo(FEES.minWithdrawalGbd)).toBe(1_000_000); // ₦10,000
  });
  it("formats naira", () => {
    expect(formatNaira(1_500_000)).toBe("₦15,000");
    expect(formatNaira(1_050)).toBe("₦10.50");
    expect(formatNaira(0)).toBe("₦0");
  });
});
