import { cn } from "@/lib/utils";

/**
 * Signature mark for Zubida YFC — a rising sun / radiant burst
 * evoking the "light of Christ" over the province. Used as the brand
 * glyph, section eyebrows, and ambient hero motif.
 */
export function Sunburst({
  className,
  rays = 12,
  animated = false,
}: {
  className?: string;
  rays?: number;
  animated?: boolean;
}) {
  const rayEls = Array.from({ length: rays }).map((_, i) => {
    const angle = (360 / rays) * i;
    return (
      <line
        key={i}
        x1="50"
        y1="8"
        x2="50"
        y2="20"
        transform={`rotate(${angle} 50 50)`}
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    );
  });

  return (
    <svg
      viewBox="0 0 100 100"
      className={cn(animated && "motion-safe:animate-spin-slow", className)}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="15" fill="currentColor" />
      <g>{rayEls}</g>
    </svg>
  );
}
