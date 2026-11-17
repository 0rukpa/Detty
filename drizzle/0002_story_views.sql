CREATE TABLE "story_views" (
	"media_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_views_media_id_user_id_pk" PRIMARY KEY("media_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_media_id_event_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."event_media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;