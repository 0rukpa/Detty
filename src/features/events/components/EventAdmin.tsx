"use client";
import { Check, Clock, Rocket, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { inviteCollaborator, removeCollaborator, respondToInvite, setPublished, type FormState } from "../actions";
import { VENDOR_LABELS, VENDOR_TYPES } from "../validation";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_review: "Under review",
  published: "Published",
  live: "Live now",
  ended: "Ended",
  settled: "Settled",
  cancelled: "Cancelled",
};

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "published" || status === "live"
      ? "bg-lime/15 text-lime"
      : status === "draft"
        ? "bg-amber/15 text-amber"
        : status === "cancelled"
          ? "bg-danger/15 text-danger"
          : "bg-surface-2 text-muted";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{STATUS_LABEL[status] ?? status}</span>;
}

/** Publish / unpublish with the server's reason shown when a rule blocks it. */
export function PublishBar({ eventId, slug, status }: { eventId: string; slug: string; status: string }) {
  const router = useRouter();
  const [result, setResult] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const run = (publish: boolean) =>
    startTransition(async () => {
      setResult(await setPublished(eventId, publish));
      router.refresh();
    });

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StatusPill status={status} />
          <Link href={`/e/${slug}`} className="text-sm font-semibold underline">
            {status === "draft" ? "Preview" : "View event page"}
          </Link>
        </div>
        {status === "draft" ? (
          <Button variant="lime" disabled={pending} onClick={() => run(true)}>
            <Rocket className="size-4" /> {pending ? "Publishing…" : "Publish"}
          </Button>
        ) : status === "published" ? (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(false)}>
            <Undo2 className="size-4" /> Back to draft
          </Button>
        ) : null}
      </div>
      <FieldError message={result.error} />
      {result.ok ? <p role="status" className="mt-2 text-sm font-semibold text-lime">{result.ok}</p> : null}
    </div>
  );
}

export type CollaboratorRow = {
  userId: string;
  handle: string;
  displayName: string;
  role: "co_host" | "promoter" | "vendor";
  vendorType: string | null;
  status: "invited" | "accepted" | "declined";
};

const ROLE_LABEL = { co_host: "Co-host", promoter: "Promoter", vendor: "Vendor" } as const;

/** Lead Plug only: invite co-hosts and promoters, and request vendor co-signs (DJ, venue...). */
export function CollaboratorManager({ eventId, collaborators }: { eventId: string; collaborators: CollaboratorRow[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(inviteCollaborator, {});
  const [role, setRole] = useState<CollaboratorRow["role"]>("co_host");
  const [, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      {collaborators.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {collaborators.map((c) => (
            <li key={c.userId} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">@{c.handle}</p>
                <p className="text-sm text-muted">
                  {c.role === "vendor" ? (VENDOR_LABELS[c.vendorType as keyof typeof VENDOR_LABELS] ?? "Vendor") : ROLE_LABEL[c.role]}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 text-xs font-bold ${c.status === "accepted" ? "text-lime" : c.status === "declined" ? "text-danger" : "text-amber"}`}>
                  {c.status === "accepted" ? <Check className="size-3.5" /> : c.status === "declined" ? <X className="size-3.5" /> : <Clock className="size-3.5" />}
                  {c.status === "accepted" ? "Confirmed" : c.status === "declined" ? "Declined" : "Waiting"}
                </span>
                <button
                  type="button"
                  aria-label={`Remove @${c.handle}`}
                  onClick={() =>
                    startTransition(async () => {
                      await removeCollaborator(eventId, c.userId);
                      router.refresh();
                    })
                  }
                  className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-danger"
                >
                  <X className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nobody yet. Confirmed vendors show as trust chips on your event page.</p>
      )}

      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <input type="hidden" name="eventId" value={eventId} />
        <div>
          <Label htmlFor="collab-handle">Invite by @handle</Label>
          <Input id="collab-handle" name="handle" required placeholder="@djspinall" autoCapitalize="none" />
        </div>
        <div>
          <Label htmlFor="collab-role">Role</Label>
          <Select id="collab-role" name="role" value={role} onChange={(e) => setRole(e.target.value as CollaboratorRow["role"])}>
            <option value="co_host">Co-host</option>
            <option value="promoter">Promoter</option>
            <option value="vendor">Vendor (co-sign)</option>
          </Select>
        </div>
        {role === "vendor" ? (
          <div>
            <Label htmlFor="collab-vendor">Type</Label>
            <Select id="collab-vendor" name="vendorType" defaultValue="dj">
              {VENDOR_TYPES.map((v) => (
                <option key={v} value={v}>
                  {VENDOR_LABELS[v]}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <Button type="submit" variant="outline" disabled={pending} className="h-12">
          {pending ? "Sending…" : "Invite"}
        </Button>
      </form>
      <FieldError message={state.error} />
      {state.ok ? <p role="status" className="text-sm font-semibold text-lime">{state.ok}</p> : null}
    </div>
  );
}

/** Accept / decline buttons for an invite or co-sign request addressed to me. */
export function InviteActions({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const respond = (accept: boolean) =>
    startTransition(async () => {
      await respondToInvite(eventId, accept);
      router.refresh();
    });
  return (
    <div className="flex gap-2">
      <button type="button" disabled={pending} onClick={() => respond(true)} className={buttonVariants({ variant: "lime", size: "sm" })}>
        Confirm
      </button>
      <button type="button" disabled={pending} onClick={() => respond(false)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
        Decline
      </button>
    </div>
  );
}
