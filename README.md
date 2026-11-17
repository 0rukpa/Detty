# Detty

**Find the party. Trust the Plug. Pull up.**

Detty is a mobile-first web app where young Nigerians discover parties, raves, picnics and
other social events, buy tickets safely, and meet the people going before they get there.

**Live demo: https://detty-party.vercel.app/**

The demo runs on Stripe test mode, so no real money moves. To buy a ticket use card
`4242 4242 4242 4242`, any future expiry date and any CVC.

## The problem

Buying a ticket to an event in Nigeria often means sending money to a stranger's bank
account from an Instagram flyer and hoping the event is real. Fake events, cloned flyers
and organisers who vanish with the money are common. Detty is built around fixing that.

## How Detty works

### For people going out

1. **Discover.** The feed and Explore tab show events near you. Filter by state, city,
   date, category, vibe, price and age limit, or switch to the map. A "Detty December"
   shortcut jumps straight to the 15 Dec to 5 Jan season.
2. **Check the host.** Every event shows who is behind it: a verified Plug, a Certified
   Plug, or a clearly labelled unverified host, along with their rating and any DJs or
   hypemen who have confirmed they are on the line-up.
3. **Buy a ticket.** Pick a tier and pay by card through Stripe. The full price breakdown
   is shown before you pay. Tickets are held for 10 minutes while you check out, so an
   event can never be oversold.
4. **Get your ticket.** It lands in your Tickets tab as a QR code. The code is
   cryptographically signed, so it cannot be guessed or forged.
5. **Join The Lounge.** Buying a ticket lets you into the event's private space, open only
   to ticket holders and the host.
6. **Pull up.** The host scans your QR code at the door. Each ticket works once.

### For organisers ("Plugs")

1. **Become a Plug** from your profile and create an event: flyer, photos, videos,
   stories, ticket tiers, venue and dress theme. The form saves as you type.
2. **Bring your team.** Invite co-hosts, and vendors such as DJs who publicly co-sign
   the event.
3. **Sell tickets.** You keep the full ticket price. Detty adds a small flat fee on top
   for the buyer.
4. **Get paid after the event starts.** Ticket money sits in escrow and unlocks when the
   event begins. The earnings dashboard shows what is in escrow, what is available and
   what has been withdrawn, with a countdown to the unlock.
5. **Run the door** with the built-in camera scanner and live guest list.

## How Detty keeps people safe

- **Escrow.** Organisers are not paid until the event actually starts. If an event is
  cancelled, every buyer is refunded in full automatically.
- **Verified hosts.** Only verified Plugs can sell paid tickets. Unverified hosts can
  list free events, with a visible warning label.
- **Watermarked flyers.** Every flyer carries the event's official Detty link and a QR
  code, so a screenshot of it always leads back to the real listing.
- **Payments only through Stripe.** No bank transfers to strangers.
- **Age limits.** Events set a minimum age, checked against the buyer's date of birth.

## Gbedu

Gbedu (GBD) is Detty's in-app currency. 1 GBD = ₦10. The Detty fee is 1 GBD per ticket
and withdrawals cost 10 GBD.

## What is built

| Area | Status |
|---|---|
| Accounts, onboarding, profiles | Done |
| Events, discovery, map, stories, flyer watermarking | Done |
| Stripe checkout, QR tickets, check-in scanner, escrow, refunds, earnings dashboard | Done |
| Plug verification, scam filter, reports, admin tools | Planned |
| Live chat in The Lounge, friends, direct messages | Planned |
| Avatars, wardrobe and shop paid for with Gbedu | Planned |
| Detty Stylist: an AI that suggests outfits for an event's theme | Planned |
| Ratings and the Certified Plug programme | Planned |

In the demo, organiser payouts are simulated, and sign-in is by email and password.
See [PROGRESS.md](PROGRESS.md) for the detailed build log.

## Built with

Next.js 16 and React 19, TypeScript, Tailwind CSS, Supabase (database, sign-in and file
storage), Drizzle ORM, Stripe, and Vercel for hosting.

## Run it locally

You need Node 20 or newer, a Supabase project and a Stripe account in test mode.

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in the values, then:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3000.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs the unit tests |
| `npm run lint` / `npm run typecheck` | Code checks |
| `npm run db:seed -- --demo` | Adds about 25 mock events for demos |
| `npm run db:remove-demo -- --yes` | Removes the mock events again |
| `npm run stripe:listen` | Forwards Stripe webhooks to your machine |

## Hosting

See [DEPLOY.md](DEPLOY.md) for the step-by-step Vercel guide.
