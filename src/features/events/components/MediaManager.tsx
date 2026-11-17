"use client";
import { Eye, Film, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FieldError, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { deleteMedia } from "../actions";
import { MEDIA_LIMITS } from "../rules";

export type ManagedMedia = {
  id: string;
  url: string;
  watermarkedUrl: string | null;
  posterUrl: string | null;
  alt: string | null;
  caption: string | null;
  isVideo: boolean;
  seenCount?: number;
  mine: boolean;
};

type Kind = "flyer" | "video" | "story";

/** Read a video's duration and grab a poster frame in the browser. */
async function probeVideo(file: File): Promise<{ duration: number; poster: Blob | null }> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("We could not read that video."));
    });
    const duration = video.duration;
    video.currentTime = Math.min(1, duration / 2);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      setTimeout(resolve, 1500);
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const poster = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return { duration, poster };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "Upload failed. Try again.";
}

export function MediaManager({
  eventId,
  flyers,
  videos,
  stories,
  canEdit,
}: {
  eventId: string;
  flyers: ManagedMedia[];
  videos: ManagedMedia[];
  stories: ManagedMedia[];
  /** Hosts manage flyers and videos. Promoters can only post stories. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const api = `/api/events/${eventId}/media`;

  const uploadImage = async (kind: "flyer" | "story" | "poster", file: Blob, extra: Record<string, string> = {}) => {
    const body = new FormData();
    body.set("kind", kind);
    body.set("file", file, "upload");
    for (const [k, v] of Object.entries(extra)) if (v) body.set(k, v);
    const res = await fetch(api, { method: "POST", body });
    if (!res.ok) throw new Error(await readError(res));
    return (await res.json()) as { url: string };
  };

  const uploadVideo = async (kind: "video" | "story", file: File) => {
    if (file.size > MEDIA_LIMITS.videoBytes) throw new Error("Videos must be 50MB or smaller.");
    const { duration, poster } = await probeVideo(file);
    if (duration > MEDIA_LIMITS.videoSeconds + 1) throw new Error("Videos must be 60 seconds or shorter.");

    const sign = await fetch(`${api}/video`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sign", kind, contentType: file.type, size: file.size, duration }),
    });
    if (!sign.ok) throw new Error(await readError(sign));
    const { bucket, path, token } = (await sign.json()) as { bucket: string; path: string; token: string };

    // Straight from the browser to Storage with the one-time token.
    const { error: upErr } = await createClient().storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType: file.type });
    if (upErr) throw new Error("The upload was interrupted. Try again.");

    const posterUrl = poster ? (await uploadImage("poster", poster).catch(() => null))?.url : undefined;
    const commit = await fetch(`${api}/video`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "commit", kind, path, posterUrl, caption: kind === "story" ? caption : undefined }),
    });
    if (!commit.ok) throw new Error(await readError(commit));
  };

  const handle = async (kind: Kind, files: FileList | null) => {
    if (!files?.length) return;
    setBusy(kind);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/");
        if (kind === "flyer") await uploadImage("flyer", file, { alt });
        else if (kind === "video") await uploadVideo("video", file);
        else if (isVideo) await uploadVideo("story", file);
        else await uploadImage("story", file, { caption });
      }
      setAlt("");
      setCaption("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    const result = await deleteMedia(id);
    if (result.error) setError(result.error);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <FieldError message={error ?? undefined} />

      {canEdit ? (
        <section>
          <h3 className="font-display text-lg font-extrabold">
            Flyers <span className="text-sm font-normal text-muted">({flyers.length}/{MEDIA_LIMITS.maxFlyers})</span>
          </h3>
          <p className="mb-3 text-sm text-muted">
            Each flyer gets an automatic QR watermark that points back to the official ticket page, so reposts can&apos;t be used to scam buyers.
          </p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {flyers.map((f) => (
              <Thumb key={f.id} src={f.watermarkedUrl ?? f.url} alt={f.alt ?? "Flyer"} onDelete={() => remove(f.id)} />
            ))}
            {flyers.length < MEDIA_LIMITS.maxFlyers ? (
              <Picker icon={ImagePlus} label="Add flyer" accept={MEDIA_LIMITS.imageTypes.join(",")} busy={busy === "flyer"} multiple onPick={(f) => handle("flyer", f)} />
            ) : null}
          </div>
          <Input value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={200} aria-label="Describe your next flyer" placeholder="Describe the next flyer for people who can't see it (alt text)" className="mt-3" />
        </section>
      ) : null}

      {canEdit ? (
        <section>
          <h3 className="font-display text-lg font-extrabold">
            Promo videos <span className="text-sm font-normal text-muted">({videos.length}/{MEDIA_LIMITS.maxVideos})</span>
          </h3>
          <p className="mb-3 text-sm text-muted">Up to 60 seconds and 50MB each. They autoplay muted in the feed.</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {videos.map((v) => (
              <Thumb key={v.id} src={v.posterUrl} alt="Promo video" video onDelete={() => remove(v.id)} />
            ))}
            {videos.length < MEDIA_LIMITS.maxVideos ? (
              <Picker icon={Film} label="Add video" accept={MEDIA_LIMITS.videoTypes.join(",")} busy={busy === "video"} onPick={(f) => handle("video", f)} />
            ) : null}
          </div>
        </section>
      ) : null}

      <section>
        <h3 className="font-display text-lg font-extrabold">Stories</h3>
        <p className="mb-3 text-sm text-muted">Photos or short clips that disappear after 24 hours. They show as a ring on your event.</p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {stories.map((s) => (
            <Thumb
              key={s.id}
              src={s.isVideo ? s.posterUrl : s.url}
              alt={s.caption ?? "Story"}
              video={s.isVideo}
              badge={
                <>
                  <Eye className="size-3" /> {s.seenCount ?? 0}
                </>
              }
              onDelete={canEdit || s.mine ? () => remove(s.id) : undefined}
            />
          ))}
          <Picker
            icon={ImagePlus}
            label="Post story"
            accept={[...MEDIA_LIMITS.imageTypes, ...MEDIA_LIMITS.videoTypes].join(",")}
            busy={busy === "story"}
            onPick={(f) => handle("story", f)}
          />
        </div>
        <Input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} aria-label="Story caption" placeholder="Caption for your next story (optional)" className="mt-3" />
      </section>
    </div>
  );
}

function Thumb({
  src,
  alt,
  video = false,
  badge,
  onDelete,
}: {
  src: string | null;
  alt: string;
  video?: boolean;
  badge?: React.ReactNode;
  onDelete?: () => void;
}) {
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-surface-2">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- thumbnails come from Storage
        <img src={src} alt={alt} className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center text-muted">
          <Film className="size-6" />
        </span>
      )}
      {video ? <Film className="absolute left-2 top-2 size-4 drop-shadow" aria-label="Video" /> : null}
      {badge ? (
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold">{badge}</span>
      ) : null}
      {onDelete ? (
        <button type="button" onClick={onDelete} aria-label={`Delete ${alt}`} className="absolute right-1.5 top-1.5 rounded-full bg-black/65 p-1.5 hover:bg-danger">
          <Trash2 className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function Picker({
  icon: Icon,
  label,
  accept,
  busy,
  multiple = false,
  onPick,
}: {
  icon: typeof Film;
  label: string;
  accept: string;
  busy: boolean;
  multiple?: boolean;
  onPick: (files: FileList | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className={cn(
          "flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm font-semibold text-muted transition hover:border-pink hover:text-foreground",
          busy && "opacity-70",
        )}
      >
        {busy ? <Loader2 className="size-6 animate-spin" /> : <Icon className="size-6" />}
        {busy ? "Uploading…" : label}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}
