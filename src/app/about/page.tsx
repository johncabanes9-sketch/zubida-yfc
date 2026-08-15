import type { Metadata } from "next";
import { getPage, getPageMeta } from "@/lib/data/pages";
import { SectionRenderer } from "@/components/pages/section-renderer";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const meta = await getPageMeta("about");
  return { title: meta.seoTitle, description: meta.seoDescription };
}

export default async function AboutPage() {
  const { sections } = await getPage("about");
  return <SectionRenderer sections={sections} />;
}
