-- Row Level Security for every table (spec Section 13 / 17).
--
-- Model: all WRITES go through the Next.js server (Drizzle, privileged role),
-- which checks authorisation in code. These policies only grant the narrow
-- READ access that the browser needs through the public anon key (for example
-- Supabase Realtime in The Lounge). A table with RLS on and no policy is fully
-- closed to anon/authenticated clients.

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
--> statement-breakpoint

-- Own profile only (dob lives here; public profile data is served by the server).
CREATE POLICY users_select_self ON public.users FOR SELECT TO authenticated
  USING (id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY avatars_select_all ON public.avatars FOR SELECT TO anon, authenticated USING (true);
--> statement-breakpoint

-- Public event data: only events that are visible to the public.
CREATE POLICY events_select_public ON public.events FOR SELECT TO anon, authenticated
  USING (status IN ('published', 'live', 'ended', 'settled') OR owner_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY event_media_select_public ON public.event_media FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));
--> statement-breakpoint
CREATE POLICY event_links_select_public ON public.event_links FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));
--> statement-breakpoint
CREATE POLICY ticket_tiers_select_public ON public.ticket_tiers FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));
--> statement-breakpoint
CREATE POLICY collaborators_select ON public.event_collaborators FOR SELECT TO anon, authenticated
  USING (status = 'accepted' OR user_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY ratings_select_all ON public.ratings FOR SELECT TO anon, authenticated USING (true);
--> statement-breakpoint
CREATE POLICY items_select_all ON public.items FOR SELECT TO anon, authenticated USING (true);
--> statement-breakpoint
CREATE POLICY gbedu_packs_select_all ON public.gbedu_packs FOR SELECT TO anon, authenticated USING (active);
--> statement-breakpoint

-- Strictly own rows.
CREATE POLICY saved_events_select_own ON public.saved_events FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY orders_select_own ON public.orders FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY tickets_select_own ON public.tickets FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY earnings_select_own ON public.organiser_earnings FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY withdrawals_select_own ON public.withdrawals FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY connect_accounts_select_own ON public.connect_accounts FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY verifications_select_own ON public.verifications FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY inventory_select_own ON public.inventory FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY fits_select_own ON public.fits FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY gbedu_ledger_select_own ON public.gbedu_ledger FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY stylist_messages_select_own ON public.stylist_messages FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY blocks_select_own ON public.blocks FOR SELECT TO authenticated
  USING (blocker_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY reports_select_own ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY friendships_select_party ON public.friendships FOR SELECT TO authenticated
  USING (requester_id = (select auth.uid()) OR addressee_id = (select auth.uid()));
--> statement-breakpoint

-- Chat: only members read a conversation and its messages (The Lounge, DMs).
CREATE POLICY conversation_members_select_own ON public.conversation_members FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY conversations_select_member ON public.conversations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_members m
    WHERE m.conversation_id = id AND m.user_id = (select auth.uid()) AND NOT m.removed
  ));
--> statement-breakpoint
CREATE POLICY messages_select_member ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_members m
    WHERE m.conversation_id = messages.conversation_id
      AND m.user_id = (select auth.uid()) AND NOT m.removed
  ));

-- escrow_releases and stripe_events: no policies on purpose (server only).
