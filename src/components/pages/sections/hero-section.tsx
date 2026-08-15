import { PageHeader } from "@/components/shared/page-header";
import type { HeroContent } from "@/lib/pages/content-schemas";

export function HeroSection({ content }: { content: HeroContent }) {
  return <PageHeader eyebrow={content.eyebrow} title={content.title} subtitle={content.subtitle} />;
}
