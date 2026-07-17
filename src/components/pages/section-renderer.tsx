import { REGISTRY } from "@/lib/pages/registry";

export type RenderableSection = { type: string; content: unknown };

/**
 * Renders each section via the registry. An unknown/legacy type is skipped
 * (never thrown), so a stray row can't take the whole public page down.
 */
export function SectionRenderer({ sections }: { sections: RenderableSection[] }) {
  return (
    <>
      {sections.map((s, i) => {
        const def = REGISTRY[s.type];
        if (!def) return null;
        const parsed = def.schema.safeParse(s.content);
        if (!parsed.success) return null;
        const Component = def.Component;
        return <Component key={i} content={parsed.data} />;
      })}
    </>
  );
}
