import { PHASE_PRODUCTION_BUILD } from "next/constants.js";
import { assertDeployEnv } from "./src/lib/env/check.mjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Tolerant: a malformed value must reach assertDeployEnv's message below, not
// crash here with a bare "Invalid URL".
const supabaseHostname = (() => {
  try {
    return supabaseUrl ? new URL(supabaseUrl).hostname : null;
  } catch {
    return null;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      { protocol: "https", hostname: "i.pravatar.cc" },
      { protocol: "https", hostname: "images.unsplash.com" },
      ...(supabaseHostname
        ? [
            {
              protocol: "https",
              hostname: supabaseHostname,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
    ],
  },
};

// Only while building: `next dev` and `next start` load this file too, and a
// local build has no VERCEL_ENV, so neither is ever blocked by it.
export default function config(phase) {
  if (phase === PHASE_PRODUCTION_BUILD) assertDeployEnv(process.env, process.env.VERCEL_ENV);
  return nextConfig;
}
