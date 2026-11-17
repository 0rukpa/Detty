ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY story_views_select_own ON public.story_views FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
