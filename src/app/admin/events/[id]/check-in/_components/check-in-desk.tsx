"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, Camera, CameraOff, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { checkIn, type CheckInCode, type CheckInResult } from "../actions";

/** How often a camera frame is decoded. Faster buys nothing at a door queue. */
const SCAN_INTERVAL_MS = 250;
/**
 * A pass held up to the camera is read several times a second, and stays in
 * view while the door reads the result. Re-reading it would replace "Checked
 * in" with "Already checked in" in front of the person just admitted, so the
 * same pass is ignored for this long unless a different one is scanned.
 */
const REPEAT_SUPPRESS_MS = 30_000;

type Tone = "success" | "warn" | "danger";

const OUTCOME: Record<CheckInCode, { tone: Tone; title: string }> = {
  CHECKED_IN: { tone: "success", title: "Checked in" },
  ALREADY: { tone: "warn", title: "Already checked in" },
  NOT_FOUND: { tone: "danger", title: "No registration with that code" },
  WRONG_EVENT: { tone: "danger", title: "This pass is for a different event" },
  BAD_TOKEN: { tone: "danger", title: "This pass does not match our records" },
  NOT_ELIGIBLE: { tone: "danger", title: "This registration cannot be admitted" },
  UNREADABLE: { tone: "danger", title: "That is not a Zubida pass or registration code" },
  ERROR: { tone: "danger", title: "Check-in failed — please try again" },
};

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-success-50 text-success-700 dark:bg-success-300/15 dark:text-success-300",
  warn: "bg-warn-50 text-warn-700 dark:bg-warn-300/15 dark:text-warn-300",
  danger: "bg-danger-50 text-danger-700 dark:bg-danger-300/15 dark:text-danger-300",
};

const time = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

function detail(r: CheckInResult): string | null {
  const reg = r.registration;
  if (r.code === "ALREADY" && reg?.checked_in_at) return `Admitted at ${time(reg.checked_in_at)}. Do not admit twice.`;
  if (r.code === "NOT_ELIGIBLE" && reg) return `This registration is ${reg.status}.`;
  if (r.code === "BAD_TOKEN") return "Ask for an ID and look the registrant up by code instead.";
  if (r.code === "CHECKED_IN" && reg?.status === "pending") return "Registration is still pending approval.";
  return null;
}

type Decoder = (video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>;

/** The platform's decoder where it exists; jsQR (loaded only then) where it does not — iOS Safari. */
async function makeDecoder(): Promise<Decoder> {
  const BD = (window as unknown as {
    BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
  }).BarcodeDetector;
  if (BD) {
    const detector = new BD({ formats: ["qr_code"] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  }
  const jsQR = (await import("jsqr")).default;
  return async (video, canvas) => {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return null;
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(video, 0, 0, w, h);
    return jsQR(g.getImageData(0, 0, w, h).data, w, h)?.data ?? null;
  };
}

export function CheckInDesk({ eventId }: { eventId: string }) {
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const [camera, setCamera] = useState<"off" | "starting" | "on">("off");
  const [cameraError, setCameraError] = useState<string | null>(null);

  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  /** The camera submits one pass at a time. Typed codes never wait on it. */
  const cameraBusy = useRef(false);
  const last = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  /** Only the newest submission may set the result: a slow earlier reply must
   *  not overwrite the answer about the person now at the door. */
  const latest = useRef(0);

  const submit = useCallback(
    (text: string, from: "camera" | "typed") => {
      if (!text.trim()) return;
      if (from === "camera") {
        if (cameraBusy.current) return;
        cameraBusy.current = true;
      }
      const mine = ++latest.current;
      start(async () => {
        let next: CheckInResult;
        try {
          next = await checkIn(eventId, text);
        } catch {
          next = { ok: false, code: "ERROR" };
        }
        if (from === "camera") cameraBusy.current = false;
        if (mine === latest.current) setResult(next);
      });
    },
    [eventId],
  );

  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera("off");
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setCamera("starting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play();
      }
      setCamera("on");
    } catch {
      stopCamera();
      setCameraError("The camera could not be opened. Allow camera access, or type the code below.");
    }
  };

  useEffect(() => {
    if (camera !== "on") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      const decode = await makeDecoder();
      const tick = async () => {
        if (stopped) return;
        if (!cameraBusy.current && video.current && canvas.current) {
          try {
            const text = await decode(video.current, canvas.current);
            const now = Date.now();
            if (text && !(text === last.current.text && now - last.current.at < REPEAT_SUPPRESS_MS)) {
              last.current = { text, at: now };
              submit(text, "camera");
            }
          } catch {
            // an unreadable frame is normal; try the next one
          }
        }
        timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      tick();
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [camera, submit]);

  useEffect(() => stopCamera, [stopCamera]);

  const outcome = result ? OUTCOME[result.code] : null;
  const note = result ? detail(result) : null;

  return (
    <div className="space-y-5">
      <div className="glass overflow-hidden rounded-3xl shadow-card">
        <div className={cn("relative bg-midnight-950", camera === "off" && "hidden")}>
          <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" aria-label="Camera preview" />
          <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-3xl border-2 border-gold-400/80" />
        </div>
        <canvas ref={canvas} className="hidden" />
        <div className="flex flex-wrap items-center gap-3 p-4">
          {camera === "off" ? (
            <Button type="button" onClick={startCamera}>
              <Camera className="h-4 w-4" /> Scan with camera
            </Button>
          ) : (
            <Button type="button" variant="subtle" onClick={stopCamera} disabled={camera === "starting"}>
              <CameraOff className="h-4 w-4" /> Stop camera
            </Button>
          )}
          <p className="text-sm text-muted">
            A handheld scanner works too: it types into the box below.
          </p>
        </div>
        {cameraError && (
          <p role="alert" className="mx-4 mb-4 rounded-2xl bg-danger-50 p-3 text-sm text-danger-700 dark:bg-danger-300/15 dark:text-danger-300">
            {cameraError}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value, "typed");
          setValue("");
          input.current?.focus();
        }}
        className="flex gap-2"
      >
        <label className="sr-only" htmlFor="pass-code">Registration code or pass link</label>
        <input
          id="pass-code"
          ref={input}
          name="pass"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ZYFC-XXXX-0000"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          className={cn(fieldClass, "font-mono")}
        />
        {/* Never disabled while a check-in is pending: a disabled default
            button blocks Enter, and the next person is already waiting. */}
        <Button type="submit" disabled={!value.trim()} className="shrink-0 whitespace-nowrap">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check in"}
        </Button>
      </form>

      <div aria-live="assertive" aria-atomic="true">
        {outcome && result && (
          <div className={cn("flex items-start gap-3 rounded-3xl p-5", TONE_CLASS[outcome.tone])}>
            {outcome.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0" />
            ) : outcome.tone === "warn" ? (
              <Clock className="mt-0.5 h-7 w-7 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-7 w-7 shrink-0" />
            )}
            <div>
              <p className="text-lg font-semibold">{outcome.title}</p>
              {result.registration?.full_name && (
                <p className="mt-1 text-2xl font-display font-semibold text-[var(--fg)]">
                  {result.registration.full_name}
                </p>
              )}
              {result.registration?.chapter && (
                <p className="text-sm">
                  {result.registration.chapter} · <span className="font-mono">{result.registration.registration_id}</span>
                </p>
              )}
              {note && <p className="mt-2 text-sm font-medium">{note}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
