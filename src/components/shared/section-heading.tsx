import { cn } from "@/lib/utils";
import { Sunburst } from "./sunburst";
import { Reveal } from "./reveal";

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <Reveal
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow && (
        <div
          className={cn(
            "mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-gold-600 dark:text-gold-400",
            align === "center" && "justify-center",
          )}
        >
          <Sunburst className="h-4 w-4" rays={8} />
          {eyebrow}
        </div>
      )}
      <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-[2.75rem]">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
          {subtitle}
        </p>
      )}
    </Reveal>
  );
}
