"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget.
 *
 * Why this exists: /api/register verifies `cf-turnstile-response` whenever
 * TURNSTILE_SECRET_KEY is set, but nothing ever rendered a widget, so that
 * field was always absent and setting the secret would have failed EVERY
 * registration with CAPTCHA_FAILED. The server half shipped without the client
 * half. This is the client half.
 *
 * The widget injects a hidden <input name="cf-turnstile-response"> into the
 * enclosing form — that is why the form reads a field it does not render, and
 * why prove:content exempts that one name from its named-control check.
 *
 * Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, which is the
 * local-development case: the server skips verification for the same reason.
 */

type TurnstileApi = {
  render: (el: HTMLElement, opts: { sitekey: string }) => string;
  remove: (id: string) => void;
};

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function api(): TurnstileApi | undefined {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

export function Turnstile({ siteKey }: { siteKey: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    let widgetId: string | undefined;
    let cancelled = false;

    // Explicit rendering, not the script's auto-scan: this widget mounts when
    // the modal opens, long after the script has loaded, so an auto-scan on
    // load would already have run and found nothing.
    const render = () => {
      const t = api();
      if (!t || cancelled) return false;
      widgetId = t.render(el, { sitekey: siteKey });
      return true;
    };

    if (!render()) {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
      return () => {
        cancelled = true;
        script?.removeEventListener("load", render);
        if (widgetId) api()?.remove(widgetId);
      };
    }

    return () => {
      cancelled = true;
      if (widgetId) api()?.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={host} data-testid="turnstile" className="flex justify-center" />;
}
