import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { parseDatabaseUrl } from "@/db/url";
import { dettyDecemberDates, parseFilters, resolveDateRange } from "@/features/events/filters";
import { parseGeoCookie } from "@/features/events/geo";
import {
  canEditDetails,
  canManageMoney,
  canPostStories,
  canPublish,
  defaultAgeMin,
  eventAccess,
  suggestTimeOfDay,
  type Actor,
} from "@/features/events/rules";
import { dateToLagosLocal, eventSchema, isPlatformUrl, lagosLocalToDate } from "@/features/events/validation";
import { processFlyer, watermarkSvg } from "@/features/events/watermark";
import { officialEventLink, slugify } from "@/lib/slug";

describe("DATABASE_URL parsing", () => {
  it("handles a normal pooler URL", () => {
    expect(parseDatabaseUrl("postgresql://postgres.abc:secret@aws-0-eu.pooler.supabase.com:6543/postgres")).toEqual({
      host: "aws-0-eu.pooler.supabase.com",
      port: 6543,
      database: "postgres",
      user: "postgres.abc",
      password: "secret",
    });
  });
  it("accepts raw special characters in the password", () => {
    const p = parseDatabaseUrl("postgresql://postgres.abc:p@ss#w/rd:1@db.example.com:5432/postgres");
    expect(p.password).toBe("p@ss#w/rd:1");
    expect(p.host).toBe("db.example.com");
  });
  it("accepts a percent-encoded password and defaults the port", () => {
    const p = parseDatabaseUrl('"postgres://u:p%40ss@host/db"');
    expect(p).toMatchObject({ password: "p@ss", port: 5432, database: "db" });
  });
  it("rejects a URL with no credentials", () => {
    expect(() => parseDatabaseUrl("postgresql://postgres.abc:half")).toThrow();
  });
});

describe("discovery filters", () => {
  // Tuesday 17 Nov 2026, 3pm Lagos
  const now = new Date("2026-11-17T14:00:00Z");

  it("parses and drops junk params", () => {
    const f = parseFilters({ state: "Lagos", cat: "rave", free: "1", tod: "brunchtime", max: "abc", vibe: ["Rave", "x"] });
    expect(f).toMatchObject({ state: "Lagos", cat: "rave", free: true, cert: false, vibe: "Rave" });
    expect(f.tod).toBeUndefined();
    expect(f.max).toBeUndefined();
    expect(parseFilters({ state: "Wakanda" }).state).toBeUndefined();
  });

  it("tonight runs from now until 6am tomorrow, Lagos time", () => {
    const r = resolveDateRange({ when: "tonight" }, now);
    expect(r.start).toEqual(now);
    expect(r.end?.toISOString()).toBe("2026-11-18T05:00:00.000Z");
  });

  it("weekend is the coming Friday to Sunday", () => {
    const r = resolveDateRange({ when: "weekend" }, now);
    expect(r.start?.toISOString()).toBe("2026-11-19T23:00:00.000Z"); // Fri 20th 00:00 WAT
    expect(r.end?.toISOString()).toBe("2026-11-22T23:00:00.000Z"); // Mon 23rd 00:00 WAT
  });

  it("weekend on a Saturday starts now and still ends Monday", () => {
    const sat = new Date("2026-11-21T20:00:00Z");
    const r = resolveDateRange({ when: "weekend" }, sat);
    expect(r.start).toEqual(sat);
    expect(r.end?.toISOString()).toBe("2026-11-22T23:00:00.000Z");
  });

  it("Detty December is Dec 15 to Jan 5", () => {
    expect(dettyDecemberDates(now)).toEqual({ from: "2026-12-15", to: "2027-01-05" });
    // On Jan 3 we are still inside the window that began last December.
    expect(dettyDecemberDates(new Date("2027-01-03T10:00:00Z"))).toEqual({ from: "2026-12-15", to: "2027-01-05" });
    const r = resolveDateRange({ when: "detty_december" }, now);
    expect(r.start?.toISOString()).toBe("2026-12-14T23:00:00.000Z");
    expect(r.end?.toISOString()).toBe("2027-01-05T23:00:00.000Z");
  });

  it("custom dates are inclusive", () => {
    const r = resolveDateRange({ from: "2026-12-01", to: "2026-12-01" }, now);
    expect(r.end!.getTime() - r.start!.getTime()).toBe(24 * 3_600_000);
  });

  it("parses the geo cookie defensively", () => {
    expect(parseGeoCookie("6.45,3.47")).toEqual({ lat: 6.45, lng: 3.47 });
    expect(parseGeoCookie("abc")).toBeNull();
    expect(parseGeoCookie("200,3")).toBeNull();
    expect(parseGeoCookie(undefined)).toBeNull();
  });
});

describe("event permissions", () => {
  it("resolves access from ownership and accepted collaborations only", () => {
    expect(eventAccess("a", "a")).toBe("owner");
    expect(eventAccess("b", "a", { role: "co_host", status: "accepted" })).toBe("co_host");
    expect(eventAccess("b", "a", { role: "co_host", status: "invited" })).toBeNull();
    expect(eventAccess("b", "a", { role: "vendor", status: "accepted" })).toBeNull();
    expect(eventAccess("b", "a", null)).toBeNull();
  });
  it("keeps money with the Lead Plug", () => {
    expect(canManageMoney("owner")).toBe(true);
    expect(canManageMoney("co_host")).toBe(false);
    expect(canEditDetails("co_host")).toBe(true);
    expect(canEditDetails("promoter")).toBe(false);
    expect(canPostStories("promoter")).toBe(true);
    expect(canPostStories(null)).toBe(false);
  });
});

describe("publish rules", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const event = { startsAt: new Date("2026-12-20T21:00:00Z"), endsAt: new Date("2026-12-21T05:00:00Z"), flyerCount: 1 };
  const free = [{ priceKobo: 0, quantity: 100 }];
  const paid = [{ priceKobo: 500_000, quantity: 100 }];
  const plug = (over: Partial<Actor> = {}): Actor => ({ id: "u", isPlug: true, plugStatus: "verified", suspended: false, ...over });

  it("lets a verified Plug publish paid events", () => {
    expect(canPublish(plug(), event, paid, now)).toEqual({ ok: true });
  });
  it("blocks regular users entirely", () => {
    expect(canPublish(plug({ isPlug: false, plugStatus: "none" }), event, free, now).ok).toBe(false);
  });
  it("lets an unverified Plug publish free events but not paid ones", () => {
    expect(canPublish(plug({ plugStatus: "pending" }), event, free, now).ok).toBe(true);
    expect(canPublish(plug({ plugStatus: "pending" }), event, paid, now).ok).toBe(false);
    expect(canPublish(plug({ plugStatus: "pending" }), event, [...free, ...paid], now).ok).toBe(false);
  });
  it("requires tiers, a flyer and a future start", () => {
    expect(canPublish(plug(), event, [], now).ok).toBe(false);
    expect(canPublish(plug(), { ...event, flyerCount: 0 }, paid, now).ok).toBe(false);
    expect(canPublish(plug(), { ...event, startsAt: new Date("2026-11-01T00:00:00Z") }, paid, now).ok).toBe(false);
    expect(canPublish(plug({ suspended: true }), event, free, now).ok).toBe(false);
  });
  it("suggests day/night and default age from Lagos time", () => {
    expect(suggestTimeOfDay(lagosLocalToDate("2026-12-20T13:00"))).toBe("day");
    expect(suggestTimeOfDay(lagosLocalToDate("2026-12-20T22:00"))).toBe("night");
    expect(suggestTimeOfDay(lagosLocalToDate("2026-12-20T02:00"))).toBe("night");
    expect(defaultAgeMin("night")).toBe(18);
    expect(defaultAgeMin("day")).toBe(0);
  });
});

describe("event validation", () => {
  const base = {
    title: "White Noise",
    category: "rave",
    themeTags: "All-White, rave ,  ",
    ageMin: "18",
    timeOfDay: "night",
    startsAt: "2026-12-20T22:00",
    endsAt: "2026-12-21T06:00",
    venueName: "The Warehouse",
    state: "Lagos",
    city: "Lekki",
    lat: "6.4474",
    lng: "3.4723",
    tiers: JSON.stringify([{ name: "VIP", priceNaira: "35000", quantity: "80", perUserLimit: "4" }]),
    links: JSON.stringify([{ platform: "instagram", url: "https://www.instagram.com/whitenoise" }]),
  };

  it("parses a full form into typed values", () => {
    const r = eventSchema.parse(base);
    expect(r.startsAt.toISOString()).toBe("2026-12-20T21:00:00.000Z"); // 10pm WAT
    expect(r.themeTags).toEqual(["all-white", "rave"]);
    expect(r.tiers[0]).toMatchObject({ name: "VIP", priceNaira: 35000, quantity: 80 });
    expect(r.hideAddress).toBe(false);
  });
  it("rejects an end before the start, kobo fractions and off-platform links", () => {
    expect(eventSchema.safeParse({ ...base, endsAt: "2026-12-20T20:00" }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, tiers: JSON.stringify([{ name: "X", priceNaira: "10.5", quantity: "1" }]) }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, links: JSON.stringify([{ platform: "instagram", url: "https://evil.example/instagram.com" }]) }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, lat: "51.5", lng: "-0.12" }).success).toBe(false); // London
  });
  it("only accepts https links on the platform's own domain", () => {
    expect(isPlatformUrl("tiktok", "https://www.tiktok.com/@detty")).toBe(true);
    expect(isPlatformUrl("x", "https://twitter.com/detty")).toBe(true);
    expect(isPlatformUrl("youtube", "https://youtu.be/abc123XYZ_-")).toBe(true);
    expect(isPlatformUrl("instagram", "http://instagram.com/detty")).toBe(false);
    expect(isPlatformUrl("instagram", "https://instagram.com.evil.io/detty")).toBe(false);
    expect(isPlatformUrl("snapchat", "javascript:alert(1)")).toBe(false);
  });
  it("round-trips Lagos local time", () => {
    expect(dateToLagosLocal(lagosLocalToDate("2026-12-31T23:30"))).toBe("2026-12-31T23:30");
  });
});

describe("slugs and watermark", () => {
  it("slugifies titles", () => {
    expect(slugify("White Noise: All-White Rave!")).toBe("white-noise-all-white-rave");
    expect(slugify("Alté Night — Lagos")).toBe("alte-night-lagos");
    expect(slugify("!!!")).toBe("event");
    expect(officialEventLink("white-noise")).toBe("detty.app/e/white-noise");
  });

  it("puts the official link and a QR code in the badge", () => {
    const { svg, w, h } = watermarkSvg("white-noise", 1080);
    expect(svg).toContain("detty.app/e/white-noise");
    expect(svg).toContain("Detty");
    expect((svg.match(/<rect /g) ?? []).length).toBeGreaterThan(100); // QR modules
    expect(w).toBeLessThan(1080 / 4);
    expect(h).toBeGreaterThan(w);
  });

  it("produces a watermarked WebP that differs only in the bottom-right corner", async () => {
    const input = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#8b3dff" } }).png().toBuffer();
    const out = await processFlyer(input, "white-noise");
    expect(out.width).toBe(800);
    expect(out.height).toBe(1000);

    const raw = (buf: Buffer) => sharp(buf).raw().toBuffer();
    const [a, b] = await Promise.all([raw(out.original), raw(out.watermarked)]);
    const px = (buf: Buffer, x: number, y: number) => [...buf.subarray((y * 800 + x) * 3, (y * 800 + x) * 3 + 3)];
    const differs = (x: number, y: number) => px(a, x, y).some((v, i) => Math.abs(v - px(b, x, y)[i]) > 12);
    expect(differs(20, 20)).toBe(false); // top-left untouched
    expect(differs(400, 500)).toBe(false); // centre untouched
    expect(differs(730, 900)).toBe(true); // inside the badge
  });

  it("downsizes huge flyers", async () => {
    const input = await sharp({ create: { width: 3000, height: 3750, channels: 3, background: "#ff2e93" } }).jpeg().toBuffer();
    const out = await processFlyer(input, "big");
    expect(out.width).toBe(1440);
  });
});
