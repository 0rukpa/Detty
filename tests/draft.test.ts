import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventFormValues } from "@/features/events/components/EventForm";
import { clearEventDraft, loadEventDraft, NEW_EVENT_DRAFT_KEY, saveEventDraft } from "@/features/events/draft";

const defaults: EventFormValues = {
  title: "",
  description: "",
  category: "party",
  theme: "",
  themeTags: "",
  vibeTags: [],
  ageMin: 18,
  timeOfDay: "night",
  startsAt: "",
  endsAt: "",
  doorsAt: "",
  venueName: "",
  address: "",
  hideAddress: false,
  state: "Lagos",
  city: "Yaba",
  lat: 6.5244,
  lng: 3.3792,
  links: [],
  tiers: [{ name: "Regular", priceNaira: "0", quantity: "100", perUserLimit: "6" }],
};

function typedForm(): FormData {
  const f = new FormData();
  f.set("title", "White Noise");
  f.set("description", "Three stages.");
  f.set("category", "rave");
  f.set("theme", "All white");
  f.set("themeTags", "all-white, rave");
  f.append("vibeTags", "Rave");
  f.append("vibeTags", "Afro House");
  f.set("ageMin", "21");
  f.set("timeOfDay", "night");
  f.set("startsAt", "2026-12-20T22:00");
  f.set("endsAt", ""); // the mistake: no end time yet
  f.set("venueName", "The Warehouse");
  f.set("hideAddress", "on");
  f.set("state", "FCT");
  f.set("city", "Abuja");
  f.set("lat", "9.0765");
  f.set("lng", "7.3986");
  f.set("tiers", JSON.stringify([{ name: "VIP", priceNaira: "35000", quantity: "80", perUserLimit: "4" }]));
  f.set("links", JSON.stringify([{ platform: "instagram", url: "https://instagram.com/whitenoise" }]));
  return f;
}

describe("event draft autosave", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns the defaults when nothing is saved", () => {
    expect(loadEventDraft(defaults, NEW_EVENT_DRAFT_KEY)).toEqual({ values: defaults, restored: false });
  });

  it("restores everything the person typed, including lists and toggles", () => {
    saveEventDraft(NEW_EVENT_DRAFT_KEY, typedForm());
    const { values, restored } = loadEventDraft(defaults, NEW_EVENT_DRAFT_KEY);
    expect(restored).toBe(true);
    expect(values).toMatchObject({
      title: "White Noise",
      description: "Three stages.",
      category: "rave",
      themeTags: "all-white, rave",
      vibeTags: ["Rave", "Afro House"],
      ageMin: 21,
      startsAt: "2026-12-20T22:00",
      endsAt: "",
      venueName: "The Warehouse",
      hideAddress: true,
      state: "FCT",
      city: "Abuja",
      lat: 9.0765,
      lng: 7.3986,
    });
    expect(values.tiers).toEqual([{ name: "VIP", priceNaira: "35000", quantity: "80", perUserLimit: "4" }]);
    expect(values.links).toEqual([{ platform: "instagram", url: "https://instagram.com/whitenoise" }]);
  });

  it("remembers an unticked checkbox and cleared vibe tags", () => {
    const f = typedForm();
    f.delete("hideAddress");
    f.delete("vibeTags");
    saveEventDraft(NEW_EVENT_DRAFT_KEY, f);
    const { values } = loadEventDraft({ ...defaults, hideAddress: true, vibeTags: ["Chill"] }, NEW_EVENT_DRAFT_KEY);
    expect(values.hideAddress).toBe(false);
    expect(values.vibeTags).toEqual([]);
  });

  it("does not announce a restore for an untouched form", () => {
    const f = new FormData();
    f.set("title", "");
    f.set("state", "Lagos");
    saveEventDraft(NEW_EVENT_DRAFT_KEY, f);
    expect(loadEventDraft(defaults, NEW_EVENT_DRAFT_KEY).restored).toBe(false);
  });

  it("survives corrupted storage and can be cleared", () => {
    localStorage.setItem(NEW_EVENT_DRAFT_KEY, "{not json");
    expect(loadEventDraft(defaults, NEW_EVENT_DRAFT_KEY).values).toEqual(defaults);
    saveEventDraft(NEW_EVENT_DRAFT_KEY, typedForm());
    clearEventDraft(NEW_EVENT_DRAFT_KEY);
    expect(loadEventDraft(defaults, NEW_EVENT_DRAFT_KEY).restored).toBe(false);
  });

  it("never reads storage without a draft key (edit form)", () => {
    saveEventDraft(NEW_EVENT_DRAFT_KEY, typedForm());
    expect(loadEventDraft(defaults, undefined)).toEqual({ values: defaults, restored: false });
  });
});
