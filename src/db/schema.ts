/**
 * Detty data model (spec Section 13).
 *
 * Rules:
 *  - Every money value is an integer: kobo for naira, whole units for GBD.
 *  - `users.id` equals the Supabase `auth.users.id` for real accounts.
 *  - RLS is enabled on every table in drizzle/0001_rls.sql. The server talks to
 *    Postgres through Drizzle (privileged) and enforces authorisation in code;
 *    RLS protects against direct access with the public anon key.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();
const kobo = (name: string) => bigint(name, { mode: "number" });

// ---------- enums ----------
export const userRole = pgEnum("user_role", ["user", "admin"]);
export const plugStatus = pgEnum("plug_status", ["none", "pending", "verified", "suspended"]);
export const verificationType = pgEnum("verification_type", [
  "id_selfie",
  "bank_name",
  "social_code",
  "venue_proof",
  "vendor_cosign",
]);
export const verificationStatus = pgEnum("verification_status", [
  "pending",
  "approved",
  "rejected",
  "requires_input",
]);
export const eventCategory = pgEnum("event_category", [
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
]);
export const eventStatus = pgEnum("event_status", [
  "draft",
  "pending_review",
  "published",
  "live",
  "ended",
  "settled",
  "cancelled",
]);
export const timeOfDay = pgEnum("time_of_day", ["day", "night"]);
export const mediaType = pgEnum("media_type", ["flyer", "video", "story"]);
export const collaboratorRole = pgEnum("collaborator_role", ["co_host", "promoter", "vendor"]);
export const inviteStatus = pgEnum("invite_status", ["invited", "accepted", "declined"]);
export const orderStatus = pgEnum("order_status", ["pending", "paid", "failed", "refunded", "expired"]);
export const ticketStatus = pgEnum("ticket_status", ["valid", "used", "refunded"]);
export const earningsBucket = pgEnum("earnings_bucket", ["escrow", "available", "withdrawn"]);
export const withdrawalStatus = pgEnum("withdrawal_status", ["pending", "paid", "failed"]);
export const payoutMode = pgEnum("payout_mode", ["auto_at_start", "manual"]);
export const conversationType = pgEnum("conversation_type", ["event_lounge", "dm", "group"]);
export const friendshipStatus = pgEnum("friendship_status", ["pending", "accepted", "declined"]);
export const itemRarity = pgEnum("item_rarity", ["common", "rare", "legendary"]);
export const ledgerReason = pgEnum("ledger_reason", [
  "purchase",
  "bonus_jara",
  "spend_item",
  "admin_adjust",
  "refund",
]);
export const reportTarget = pgEnum("report_target", ["event", "user", "message", "rating"]);
export const reportStatus = pgEnum("report_status", ["open", "reviewing", "resolved", "dismissed"]);
export const dmPrivacy = pgEnum("dm_privacy", ["everyone", "friends"]);

// ---------- users & persona ----------
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(), // = auth.users.id
    handle: text("handle").notNull(),
    displayName: text("display_name").notNull(),
    dob: date("dob").notNull(), // is_minor is derived from this, never stored
    homeState: text("home_state").notNull(),
    homeCity: text("home_city").notNull(),
    bio: text("bio").notNull().default(""),
    pronouns: text("pronouns"),
    vibeTags: text("vibe_tags").array().notNull().default(sql`'{}'::text[]`),
    role: userRole("role").notNull().default("user"),
    isPlug: boolean("is_plug").notNull().default(false),
    plugStatus: plugStatus("plug_status").notNull().default("none"),
    certifiedPlug: boolean("certified_plug").notNull().default(false),
    ratingAvg: doublePrecision("rating_avg").notNull().default(0), // display only, not money
    ratingCount: integer("rating_count").notNull().default(0),
    payoutMode: payoutMode("payout_mode").notNull().default("auto_at_start"),
    earlyAccessFrozen: boolean("early_access_frozen").notNull().default(false),
    // Early access already spent on an event that was later cancelled; recovered from future releases.
    earlyAccessDebtKobo: kobo("early_access_debt_kobo").notNull().default(0),
    isPrivate: boolean("is_private").notNull().default(false), // forced true for minors
    dmPrivacy: dmPrivacy("dm_privacy").notNull().default("everyone"),
    hideAttendance: boolean("hide_attendance").notNull().default(false),
    suspended: boolean("suspended").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_handle_ci_idx").on(sql`lower(${t.handle})`)],
);

export const avatars = pgTable("avatars", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  bodyType: text("body_type").notNull().default("regular"),
  skinTone: text("skin_tone").notNull().default("brown-3"),
  face: text("face").notNull().default("oval"),
  hair: text("hair").notNull().default("low-cut"),
  facialHair: text("facial_hair").notNull().default("none"),
  equipped: jsonb("equipped").$type<Record<string, string>>().notNull().default({}),
});

// ---------- trust ----------
export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id"), // set for venue_proof / vendor_cosign
    type: verificationType("type").notNull(),
    status: verificationStatus("status").notNull().default("pending"),
    provider: text("provider"),
    providerRef: text("provider_ref"),
    // Status, legal name, DOB and ID type only. NEVER raw ID images.
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    reviewedBy: uuid("reviewed_by"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verifications_user_idx").on(t.userId)],
);

export const connectAccounts = pgTable("connect_accounts", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeAccountId: text("stripe_account_id").notNull().unique(),
  chargesEnabled: boolean("charges_enabled").notNull().default(false),
  payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
  legalName: text("legal_name"),
});

// ---------- events ----------
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    ownerId: uuid("owner_id") // exactly one Lead Plug; only they get paid
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: eventCategory("category").notNull().default("party"),
    theme: text("theme").notNull().default(""),
    themeTags: text("theme_tags").array().notNull().default(sql`'{}'::text[]`),
    vibeTags: text("vibe_tags").array().notNull().default(sql`'{}'::text[]`),
    ageMin: integer("age_min").notNull().default(18), // 0 = all ages
    timeOfDay: timeOfDay("time_of_day").notNull().default("night"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    doorsAt: ts("doors_at"),
    venueName: text("venue_name").notNull(),
    address: text("address").notNull().default(""),
    hideAddress: boolean("hide_address").notNull().default(false),
    state: text("state").notNull(),
    city: text("city").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    status: eventStatus("status").notNull().default("draft"),
    payoutMode: payoutMode("payout_mode"), // per-event override of the Plug's default
    riskFlags: jsonb("risk_flags").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [
    index("events_state_starts_idx").on(t.state, t.startsAt),
    index("events_owner_idx").on(t.ownerId),
    index("events_status_idx").on(t.status),
  ],
);

export const eventMedia = pgTable(
  "event_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    type: mediaType("type").notNull(),
    url: text("url").notNull(),
    watermarkedUrl: text("watermarked_url"),
    posterUrl: text("poster_url"),
    alt: text("alt"),
    caption: text("caption"),
    expiresAt: ts("expires_at"), // stories: 24h
    createdBy: uuid("created_by").references(() => users.id),
    order: integer("order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("event_media_event_idx").on(t.eventId)],
);

/** Who has seen which story, for the hosts' "seen by" count. */
export const storyViews = pgTable(
  "story_views",
  {
    mediaId: uuid("media_id")
      .notNull()
      .references(() => eventMedia.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.mediaId, t.userId] })],
);

export const eventLinks = pgTable(
  "event_links",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    url: text("url").notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.platform] })],
);

export const eventCollaborators = pgTable(
  "event_collaborators",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: collaboratorRole("role").notNull(),
    vendorType: text("vendor_type"), // dj | hypeman | venue | photographer | caterer
    status: inviteStatus("status").notNull().default("invited"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);

export const savedEvents = pgTable(
  "saved_events",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.eventId] })],
);

// ---------- tickets & money ----------
export const ticketTiers = pgTable(
  "ticket_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceKobo: kobo("price_kobo").notNull(), // 0 = free
    quantity: integer("quantity").notNull(),
    sold: integer("sold").notNull().default(0),
    reserved: integer("reserved").notNull().default(0), // 10-minute checkout holds
    perUserLimit: integer("per_user_limit").notNull().default(10),
    salesStart: ts("sales_start"),
    salesEnd: ts("sales_end"),
  },
  (t) => [index("ticket_tiers_event_idx").on(t.eventId)],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    tierId: uuid("tier_id").references(() => ticketTiers.id),
    quantity: integer("quantity").notNull().default(1),
    stripeCheckoutId: text("stripe_checkout_id").unique(),
    paymentIntentId: text("payment_intent_id"),
    amountKobo: kobo("amount_kobo").notNull(), // total charged to the buyer
    feeKobo: kobo("fee_kobo").notNull(), // Detty fee
    processingFeeKobo: kobo("processing_fee_kobo").notNull(),
    organiserNetKobo: kobo("organiser_net_kobo").notNull(), // price × qty
    status: orderStatus("status").notNull().default("pending"),
    holdExpiresAt: ts("hold_expires_at"),
    createdAt: createdAt(),
  },
  (t) => [index("orders_user_idx").on(t.userId), index("orders_event_idx").on(t.eventId)],
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    tierId: uuid("tier_id")
      .notNull()
      .references(() => ticketTiers.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    qrToken: text("qr_token").notNull().unique(), // signed token, not just an id
    status: ticketStatus("status").notNull().default("valid"),
    checkedInAt: ts("checked_in_at"),
    createdAt: createdAt(),
  },
  (t) => [index("tickets_user_idx").on(t.userId), index("tickets_event_idx").on(t.eventId)],
);

export const organiserEarnings = pgTable(
  "organiser_earnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    amountKobo: kobo("amount_kobo").notNull(),
    bucket: earningsBucket("bucket").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("earnings_user_event_bucket_idx").on(t.userId, t.eventId, t.bucket)],
);

export const withdrawals = pgTable("withdrawals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  eventId: uuid("event_id").references(() => events.id),
  amountKobo: kobo("amount_kobo").notNull(),
  feeKobo: kobo("fee_kobo").notNull(),
  netKobo: kobo("net_kobo").notNull(),
  stripeTransferId: text("stripe_transfer_id"),
  provider: text("provider").notNull().default("stripe"),
  early: boolean("early").notNull().default(false), // taken before the event started (early access)
  auto: boolean("auto").notNull().default(false), // automatic payout rather than a manual withdrawal
  failureReason: text("failure_reason"),
  status: withdrawalStatus("status").notNull().default("pending"),
  createdAt: createdAt(),
});

export const escrowReleases = pgTable("escrow_releases", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  releaseAt: ts("release_at").notNull(),
  status: text("status").notNull().default("scheduled"), // scheduled | released | blocked
  stripeTransferId: text("stripe_transfer_id"),
  amountKobo: kobo("amount_kobo").notNull().default(0),
});

/** Processed Stripe webhook event ids, for idempotency. */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  createdAt: createdAt(),
});

// ---------- ratings ----------
export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    organiserId: uuid("organiser_id")
      .notNull()
      .references(() => users.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    stars: integer("stars").notNull(),
    review: text("review"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    organiserReply: text("organiser_reply"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("ratings_event_user_idx").on(t.eventId, t.userId),
    index("ratings_organiser_idx").on(t.organiserId),
  ],
);

// ---------- chat & social ----------
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: conversationType("type").notNull(),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // member | host | moderator
    mutedUntil: ts("muted_until"),
    removed: boolean("removed").notNull().default(false),
    lastReadAt: ts("last_read_at"),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull().default(""),
    mediaUrl: text("media_url"),
    replyTo: uuid("reply_to"),
    pinned: boolean("pinned").notNull().default(false),
    flagged: boolean("flagged").notNull().default(false),
    deleted: boolean("deleted").notNull().default(false),
    reactions: jsonb("reactions").$type<Record<string, string[]>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const friendships = pgTable(
  "friendships",
  {
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addresseeId: uuid("addressee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: friendshipStatus("status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.requesterId, t.addresseeId] })],
);

export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id")
    .notNull()
    .references(() => users.id),
  targetType: reportTarget("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  reason: text("reason").notNull(),
  status: reportStatus("status").notNull().default("open"),
  createdAt: createdAt(),
});

// ---------- wardrobe & Gbedu ----------
export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slot: text("slot").notNull(), // top | bottom | dress | shoes | accessory | headwear
  category: text("category").notNull().default("basics"),
  rarity: itemRarity("rarity").notNull().default("common"),
  priceGbd: integer("price_gbd").notNull().default(0),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  previewUrl: text("preview_url"),
  assetGlb: text("asset_glb"),
  assetPngLayers: jsonb("asset_png_layers").$type<Record<string, string>>().notNull().default({}),
  isBasic: boolean("is_basic").notNull().default(false),
  dropStart: ts("drop_start"),
  dropEnd: ts("drop_end"),
});

export const inventory = pgTable(
  "inventory",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    acquiredAt: ts("acquired_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);

export const fits = pgTable("fits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  itemIds: uuid("item_ids").array().notNull().default(sql`'{}'::uuid[]`),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/** Append-only ledger. Balance = sum(delta). Never mutate a balance number. */
export const gbeduLedger = pgTable(
  "gbedu_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    delta: integer("delta").notNull(), // + credit, - debit, in whole GBD
    reason: ledgerReason("reason").notNull(),
    refId: text("ref_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("gbedu_ledger_user_idx").on(t.userId),
    // one ledger row per (reason, ref) so a replayed webhook can't double-credit
    uniqueIndex("gbedu_ledger_ref_idx").on(t.userId, t.reason, t.refId),
  ],
);

export const gbeduPacks = pgTable("gbedu_packs", {
  id: uuid("id").primaryKey().defaultRandom(),
  gbdAmount: integer("gbd_amount").notNull(),
  jaraBonus: integer("jara_bonus").notNull().default(0),
  priceKobo: kobo("price_kobo").notNull(),
  active: boolean("active").notNull().default(true),
});

export const stylistMessages = pgTable(
  "stylist_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: jsonb("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("stylist_messages_user_idx").on(t.userId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type TicketTier = typeof ticketTiers.$inferSelect;
