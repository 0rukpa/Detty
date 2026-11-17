# Putting Detty online

Detty is hosted on **Vercel** (the company behind Next.js; free plan is enough to start).
The database, sign-in and images stay on your existing **Supabase** project, and payments
stay on your **Stripe** account. Nothing needs moving.

Total time: about 15 minutes. Steps marked **(you)** need your own sign-in, so only you can do them.

## 1. Create a Vercel account (you)

Go to https://vercel.com/signup and sign up (the "Hobby" plan is free).

## 2. Sign in from this computer (you)

In a terminal in the `Detty` folder:

```bash
npm run vercel -- login
```

It opens a browser page; approve it there.

## 3. Create the project and connect this folder

```bash
npm run vercel -- link
```

Answer: set up = **yes**, scope = your account, link to existing project = **no**,
name = `detty`, directory = `./` (just press Enter). This creates an empty project and a
hidden `.vercel` folder here. Nothing is public yet.

Your address will be `https://detty.vercel.app`, or a close variant if that name is taken.
Check it in the Vercel dashboard under the project's **Domains** before the next step.

## 4. Send the settings to Vercel

Vercel cannot see `.env.local`, so the keys have to be copied over. This command does it
without showing any of them on screen:

```bash
npm run deploy:env -- https://detty.vercel.app
```

(Use your real address from step 3.) It sets every value from `.env.local` and sets
`NEXT_PUBLIC_APP_URL` to the address you pass. It skips `STRIPE_WEBHOOK_SECRET`; see step 7.

## 5. Go live

```bash
npm run deploy
```

Takes two to three minutes and prints the live address at the end.
Run the same command any time you want to publish new changes.

## 6. Tell Supabase about the new address (you)

Without this, sign-up emails and Google sign-in send people back to `localhost`.

Supabase Dashboard > Authentication > URL Configuration:

- **Site URL**: `https://detty.vercel.app`
- **Redirect URLs**: add `https://detty.vercel.app/auth/callback`
  (keep `http://localhost:3000/auth/callback` so local testing still works)

If Google sign-in is on, also add `https://detty.vercel.app` to the authorised JavaScript
origins in Google Cloud Console. The redirect URI there stays the Supabase one.

## 7. Turn on Stripe webhooks for the live site (you)

Stripe Dashboard (test mode) > Developers > Webhooks > **Add endpoint**:

- URL: `https://detty.vercel.app/api/stripe/webhook`
- Events: `checkout.session.completed`, `checkout.session.expired`,
  `checkout.session.async_payment_succeeded`, `payment_intent.payment_failed`,
  `charge.refunded`, `account.updated`,
  `transfer.created`, `transfer.reversed`

Copy the **Signing secret** (`whsec_...`), then in Vercel > Project > Settings >
Environment Variables add `STRIPE_WEBHOOK_SECRET` with that value (Production), and run
`npm run deploy` once more. Ticket purchases work without this, because the success page
confirms payment directly, but webhooks are the safety net for refunds and closed tabs.

## 8. Check it

- Open the address on your phone. Sign up, create an event, buy a ticket with the test
  card `4242 4242 4242 4242` (any future date, any CVC).
- The ticket should appear under Tickets with a QR code.

## Things to know

- **Scheduled job.** Money moves from escrow to "available" by a job at
  `/api/cron/escrow`. Vercel's free plan only runs scheduled jobs once a day, so
  `vercel.json` is set to daily (04:00 UTC). For releases within minutes of an event
  starting, either upgrade to Vercel Pro and change the schedule back to `*/5 * * * *`,
  or use a free pinger such as cron-job.org to call that address every 5 minutes with the
  header `Authorization: Bearer <your CRON_SECRET>`.
- **Still test mode.** The site uses Stripe test keys, so no real money moves. Going live
  for real needs live Stripe keys, a completed Stripe business profile, and
  `PAYOUT_PROVIDER` switched away from `mock`.
- **Upload size.** Vercel limits a single upload through the app to about 4.5 MB.
  Flyers and photos larger than that will be rejected; videos are not affected (they
  upload straight to Supabase).
- **Custom domain.** Vercel > Project > Settings > Domains. After adding one, repeat
  steps 4, 6 and 7 with the new address.
- **Demo data.** `npm run db:seed` only adds the Gbedu packs. Mock events are opt-in
  (`npm run db:seed -- --demo`) and `npm run db:remove-demo -- --yes` deletes them again.
  Local and live share one database, so anything seeded locally shows on the live site.

## Optional: deploy from GitHub instead

If you push this folder to a GitHub repository, you can import it at
https://vercel.com/new and Vercel will redeploy on every push. The settings from
step 4 and the Supabase and Stripe steps are the same.
