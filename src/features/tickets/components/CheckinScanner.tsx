"use client";
import jsQR from "jsqr";
import { Camera, CameraOff, CheckCircle2, Copy, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkInTicket, type CheckInState } from "@/features/payments/actions";
import { cn } from "@/lib/utils";

const RESCAN_MS = 2500;

/**
 * Door scanner: reads ticket QR codes with the device camera (decoded in the
 * browser with jsQR) and checks each one in on the server. The server verifies
 * the signature and blocks duplicates; this component only shows the verdict.
 */
export function CheckinScanner({ eventId }: { eventId: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busy = useRef(false);
  const lastToken = useRef({ token: "", at: 0 });
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckInState>({ status: "idle" });
  const [manual, setManual] = useState("");

  const submit = useCallback(
    async (token: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const verdict = await checkInTicket(eventId, token);
        setResult(verdict);
        if ("vibrate" in navigator) navigator.vibrate(verdict.status === "ok" ? 80 : [60, 60, 60]);
        if (verdict.status === "ok") router.refresh();
      } finally {
        busy.current = false;
      }
    },
    [eventId, router],
  );

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && !busy.current) {
        // Downscale for speed; QR codes decode fine at ~480px.
        const scale = Math.min(1, 480 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
          const now = Date.now();
          // Don't re-submit the same ticket while it is still in front of the camera.
          if (code?.data && !(code.data === lastToken.current.token && now - lastToken.current.at < RESCAN_MS)) {
            lastToken.current = { token: code.data, at: now };
            void submit(code.data);
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
        frame = requestAnimationFrame(tick);
      })
      .catch(() => {
        setCameraError("We could not open the camera. Allow camera access, or type the ticket code below.");
        setScanning(false);
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning, submit]);

  const tone =
    result.status === "ok" ? "border-lime bg-lime/15 text-lime" : result.status === "duplicate" ? "border-amber bg-amber/15 text-amber" : "border-danger bg-danger/15 text-danger";

  return (
    <div className="space-y-4">
      <div className="relative aspect-square overflow-hidden rounded-card border border-border bg-black">
        <video ref={videoRef} muted playsInline className={cn("size-full object-cover", !scanning && "hidden")} aria-label="Camera preview" />
        <canvas ref={canvasRef} className="hidden" />
        {scanning ? (
          <span aria-hidden className="pointer-events-none absolute inset-[18%] rounded-3xl border-4 border-white/80" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
            <Camera className="size-10 text-muted" />
            <p className="text-sm text-muted">Point the camera at a guest&apos;s ticket QR code.</p>
          </div>
        )}
      </div>

      <Button
        variant={scanning ? "outline" : "lime"}
        size="lg"
        className="w-full"
        onClick={() => {
          setCameraError(null);
          setScanning((s) => !s);
        }}
      >
        {scanning ? (
          <>
            <CameraOff className="size-5" /> Stop scanning
          </>
        ) : (
          <>
            <Camera className="size-5" /> Start scanning
          </>
        )}
      </Button>
      {cameraError ? <p className="text-sm text-amber">{cameraError}</p> : null}

      <div aria-live="assertive">
        {result.status !== "idle" ? (
          <div className={cn("flex items-start gap-3 rounded-card border-2 p-4", tone)}>
            {result.status === "ok" ? <CheckCircle2 className="mt-0.5 size-7 shrink-0" /> : result.status === "duplicate" ? <Copy className="mt-0.5 size-7 shrink-0" /> : <XCircle className="mt-0.5 size-7 shrink-0" />}
            <div>
              <p className="font-display text-xl font-extrabold">{result.message}</p>
              {result.detail ? <p className="text-sm text-foreground">{result.detail}</p> : null}
            </div>
          </div>
        ) : null}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) void submit(manual.trim());
        }}
      >
        <Input value={manual} onChange={(e) => setManual(e.target.value)} aria-label="Ticket code" placeholder="Or paste the ticket code" autoCapitalize="none" autoComplete="off" />
        <Button type="submit" variant="outline" className="h-12 shrink-0">
          Check
        </Button>
      </form>
    </div>
  );
}
