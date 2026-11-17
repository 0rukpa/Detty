# Detty: Progress

Running log of what is done, what is mocked and what is next. Spec: `DETTY_BUILD_PROMPT.md`.

## Hosting prep (17 Nov 2026)

- Mock data removed from the database: 27 seeded events, 8 mock host accounts, 56 demo images. Real accounts and their events untouched.
- `npm run db:seed` now only adds Gbedu packs; mock events need `-- --demo`. `npm run db:remove-demo` (dry run) / `-- --yes` deletes them.
- `DEPLOY.md`: step-by-step Vercel hosting guide. `npm run deploy:env -- <url>` copies `.env.local` to Vercel without printing values; `npm run deploy` publishes.
- `vercel.json` cron is now daily (Vercel free plan limit). See DEPLOY.md for 5-minute options.
- **Not deployed yet**: needs the founder to create a Vercel account and run `npx vercel@latest login`.

## Phase 3: Stripe core (built; buying through the real Stripe page not yet clicked through)

### Done
- **Checkout** (`src/features/payments/checkout.ts`): Stripe Checkout in NGN with separate charges and transfers. Line items: tickets, "Detty fee (N GBD)", "Processing fee". Free tickets skip Stripe.
- **Fee maths** (`pricing.ts`): 1 GBD (₦10) per ticket on top; the Plug keeps the full ticket price; the processing fee is the exact minimum that covers Stripe's cut so Detty never loses its fee. Integer kobo only.
- **Ticket picker** on the event page with the full breakdown before paying.
- **Inventory holds**: tickets reserved for 10 minutes at checkout, atomically (no overselling); per-person limits; holds released on cancel, expiry or failure.
- **Fulfilment** (`ledger.ts`): idempotent. Issues signed QR tickets, credits the Plug's escrow, adds the buyer to The Lounge.
- **Webhooks** `/api/stripe/webhook`: signature verified, idempotent. Handles checkout completed / expired, payment failed, charge refunded, account updated, transfer created / reversed. Identity events are stubs for Phase 4.
- **Success page** re-fetches the session from Stripe with the secret key before fulfilling, so buyers are not left waiting on webhook delivery. Then redirects to The Lounge with confetti.
- **My Tickets** wallet with a QR per ticket (HMAC-signed token, `src/features/tickets/qr.ts`).
- **Check-in scanner** `/plug/events/[id]/checkin`: camera QR scan in the browser (jsQR), manual code entry, duplicate blocking, guest list with check-in times.
- **The Lounge landing** `/lounge/[eventId]`: members only (ticket holders + Lead Plug). Realtime chat itself is Phase 5. Chats tab lists your Lounges.
- **Escrow** (`jobs.ts`, `/api/cron/escrow`, `vercel.json` every 5 min): at event start, escrow moves to Available; events flip to live / ended; auto payout if that is the Plug's mode; balances under the minimum are swept 24h after the event.
- **Earnings dashboard** `/plug/payouts`: In escrow / Available / Withdrawn, unlock countdown, per-event breakdown, payout mode (auto or manual), withdraw with the ₦100 fee shown first, payout history.
- **Early access** before the event: Certified Plugs 50%, Plugs with approved venue proof 25%, others 0%. If such an event is cancelled the amount becomes a debt recovered from future releases, and early access freezes.
- **Cancel event** (Lead Plug, before it starts): refunds every paid order in full through Stripe and voids the tickets.
- **Payout providers** (`providers.ts`): `StripeConnectPayoutProvider` (Accounts v2), `MockPayoutProvider` (test mode only, `PAYOUT_PROVIDER=mock`), and a documented `PaystackPayoutProvider` placeholder.
- **Demo tools**: "Simulate event start" button (test keys only) and `npm run dev:verify-plug -- <handle> [--certified]` to mark an account verified until Phase 4 exists.

### Verified
- `npm run lint`, `npm run typecheck`, `npm test` (65 tests) and `npm run build` pass.
- End-to-end script against the real database and Stripe test mode, 19 checks, all passing: draft events not purchasable, per-person limit, 10-minute hold, oversell blocked, unpaid session issues nothing, real NGN test-card charge, tampered amount rejected, fulfilment, replay idempotent, signed QR tokens, inventory counts, Lounge membership, full ticket price in escrow, no withdrawal while in escrow, release at event start (once only), withdrawal with ₦100 fee (mock payout rail), full Stripe refund, tickets voided.

### Not verified yet
- Paying through Stripe's hosted checkout page in a browser and the redirect back to The Lounge. (Its card form would not render in the embedded test browser; the charge in the test above was made through the API instead.)
- Stripe Connect onboarding and real transfers: blocked on the Stripe account, see below.
- Webhook delivery: no `STRIPE_WEBHOOK_SECRET` yet, so the endpoint returns 503. Purchases complete via the success page, and `reconcilePendingOrders()` (cron, and on opening My Tickets) asks Stripe directly about unpaid-looking checkouts, so a buyer who closes the tab still gets their ticket. That recovery path has not been exercised with a real hosted payment.
- Locally nothing calls `/api/cron/escrow` (Vercel Cron only runs in production). Use the Simulate event start button, or call the endpoint with the `CRON_SECRET` bearer token.
- The signed-in screens (earnings dashboard, scanner camera, cancel button) have not been clicked through in a browser.

### Needs the founder
1. **Stripe Connect liability acknowledgement.** Stripe refuses to create payout accounts until the platform accepts loss liability: Stripe Dashboard > Settings > Connect > Platform profile. Until then "Set up payouts" shows that message.
2. Meanwhile, to demo escrow -> withdraw, set `PAYOUT_PROVIDER=mock` in `.env.local` and restart. Payouts are then simulated and labelled "simulated".
3. Optional: install the Stripe CLI and run `stripe listen --forward-to localhost:3000/api/stripe/webhook`, then put the printed secret in `STRIPE_WEBHOOK_SECRET`.
4. Done: `TICKET_SIGNING_SECRET` and `CRON_SECRET` are generated in `.env.local`. Set the same two (new values) in Vercel for production.

### Production notes
- The platform is a US Stripe account, so its balance is in USD. Transfers convert naira to USD at a fixed demo rate (`PAYOUT_FX` in `src/config/fees.ts`).
- Stripe's cost is an estimate (`STRIPE_FEE`: 4.4% + ₦500). On an ₦8,000 ticket that shows a processing fee of about ₦890. Tune it to the real pricing, or switch `passStripeFeeToBuyer` off.
- Test-mode transfers need an available platform balance; card 4000 0000 0000 0077 adds funds instantly.
- Stripe Connect cannot straightforwardly pay Nigerian bank accounts: production needs a local rail (the Paystack placeholder).
- If a transfer call crashes mid-flight, the withdrawal stays "pending" with the funds already moved; an admin reconcile view is a Phase 4 item.
- A refund after the Plug has already withdrawn leaves a negative escrow row for that event (the platform is owed). Debt recovery currently only covers early access.

### Fixed along the way
- Pages hung for minutes after the app sat idle: stale database connections. The client now closes idle connections and uses keep-alive (`src/db/index.ts`).

## Phase 2: Events + discovery (built; signed-in flows not yet exercised in a browser)

### Done
- **Discovery filters** in the URL (`src/features/events/filters.ts`, `FilterBar`): Day / Night, Tonight, This weekend, Detty December, custom dates, category, vibe, max price, Free only, Certified Plugs only, state.
- **Near me**: the chip asks for geolocation, stores a rounded location in a cookie (never the URL), and the feed sorts by distance. Falls back to the home state when location is off.
- **Detty Travel + map** on Explore: one-tap city shortcuts, the "Detty December" preset, a Leaflet / OpenStreetMap map with event pins (rainbow pins for Certified Plugs) and a list.
- **Event page** `/e/[slug]`: swipeable media carousel, stories ring and full-screen viewer, hosts and co-hosts, badges, rating summary, vendor co-sign chips, details, dress code, ticket tiers, social link chips (YouTube embeds), save and share. Share always uses the official Detty link.
- **Age gate**: 18+ events are filtered out of the feed and blocked on the event page for under-18 accounts, server-side.
- **Become a Plug** (profile): upgrades the same account, 18+ by typed DOB for now. Status stays `pending` until Phase 4 verification.
- **Create / edit event** (`/plug`, `/plug/events/new`, `/plug/events/[id]`): details, Lagos-time dates, day/night and age auto-suggest, location pin, theme and vibe tags, ticket tiers, social links.
- **Publish rules** (`rules.ts`): only Plugs publish; paid events need a verified Plug; free events from unverified Plugs show "Unverified host"; needs a tier, a flyer and a future start.
- **Media**: flyer upload (up to 10) with the automatic QR + link + logo watermark (`watermark.ts`, sharp + qrcode); promo videos (60s / 50MB, uploaded straight to Storage with a signed URL, poster frame captured in the browser); 24-hour stories (image or video) with "seen by" counts.
- **Collaborators and co-signs**: Lead Plug invites by @handle as co-host, promoter or vendor; the invitee accepts or declines from their profile; only accepted ones show publicly.
- **Roles enforced on the server**: co-hosts edit details and media, promoters only post stories, tiers / publishing / invites stay with the Lead Plug.
- **Seed**: 27 events now have generated flyers with real watermarks, two stories on the headline rave, and DJ / hypeman co-signs.
- **Tolerant `DATABASE_URL` parsing** (`src/db/url.ts`) so passwords with `@`, `#` or `/` work without URL-encoding.

### Verified
- `npm run lint`, `npm run typecheck`, `npm test` (39 tests) and `npm run build` pass.
- Migrations and seed applied to the real Supabase database, including Storage uploads.
- In the browser, signed out: feed with flyers, Detty December + Lagos filter, event page, stories viewer, Explore map and list.

### Not verified yet
- Everything that needs a signed-in account has not been clicked through: sign-up and onboarding, Become a Plug, creating / editing / publishing an event, flyer / video / story uploads from the UI, invites and co-signs, save, "seen by" counts. The upload pipeline itself (sharp, watermark, Storage) did run for real through the seed.
- Near me with a real device location.

### Mocked / deferred
- Friends going (Phase 5), Report button and the scam text filter (Phase 4), "My fit for this party" (Phase 6).
- Video length is checked from what the browser reports; size is verified server-side. A server-side probe (ffprobe) is a production follow-up.
- Lineup tagging is covered by vendor co-signs (DJ, hypeman). There is no separate lineup list.
- Collaborator revenue split (stretch) is not built.
- Seeded flyers are generated typographic posters, not real artwork.

### Decisions to flag
- A Plug who is not yet verified CAN publish free events (with the amber "Unverified host" label) but not paid ones. This reads spec 4.2 together with 6.8. Say if you would rather block all publishing until verification.
- Watermark text uses the system Arial font. On Vercel a bundled font should be added so the link text renders the same.

## Phase 1: Foundation (done)
- Next.js 16.4 (App Router, Cache Components) + TypeScript strict + Tailwind 4, dark-first theme.
- Config in `src/config/` (brand, fees, product constants, 36 states + FCT).
- Drizzle schema (30 tables), migrations in `drizzle/`, RLS on every table.
- Supabase Auth: email + password, Google, phone OTP. Onboarding with unique handles and under-18 safeguards.
- App shell with bottom tab bar, `<GbeduAmount />`, empty states and skeletons.

### Defaults in use
- Minimum signup age 13; Gbedu cannot buy tickets.
- All database writes go through the server (Drizzle). RLS only grants narrow read access to the browser.
- Seeded Plugs and vendors are profile rows without logins.
- UI primitives are hand-written in the shadcn style; the shadcn CLI has not been run.

## Setup
1. Copy `.env.example` to `.env.local` and fill in the Supabase URL, anon key, service role key and `DATABASE_URL`. **Wrap `DATABASE_URL` in double quotes** if the password contains `#`.
2. `npm run db:migrate` then `npm run db:seed`.
3. `npm run dev`. Restart it after changing `.env.local`.
4. For Google and phone login, enable those providers in Supabase Auth and add `http://localhost:3000/auth/callback` to the redirect URLs.

## Next: Phase 4 (Trust)
Plug upgrade flow, Stripe Identity + provider interface, bank name match, social code, venue proof, badges, scam text filter, reports, admin queue.

## Local machine note: "fetch failed" on sign-in
This PC runs Avast Web Shield, which re-signs HTTPS with its own root certificate. Node did not trust it, so every server-side call to Supabase Auth failed with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (shown to users as "fetch failed"). `npm run dev`, `npm start` and `npm run db:seed` now go through `scripts/with-system-ca.mjs`, which adds `--use-system-ca` so Node trusts the Windows certificate store. TLS verification stays on. Production on Vercel is unaffected. The same fix covers Stripe and Anthropic calls in later phases.
