import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { LeadersDirectory } from "@/components/leaders/leaders-directory";
import { UnpublishedNotice } from "@/components/shared/unpublished-notice";
import { getLeaders } from "@/lib/data/leaders";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Leaders",
  description:
    "Meet the coordinators and leaders serving the Youth for Christ community of Zamboanga del Sur.",
};

export default async function LeadersPage() {
  const leaders = await getLeaders();
  return (
    <>
      <PageHeader
        eyebrow="Our Leaders"
        title="The servants behind the mission"
        subtitle="The people who pray, plan, and pour themselves out for the youth of Zamboanga del Sur."
      />
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        {leaders.length > 0 ? (
          <LeadersDirectory leaders={leaders} />
        ) : (
          <UnpublishedNotice
            title="Our leadership directory isn't published yet"
            detail="We'd rather show nothing than show the wrong names. The provincial team is preparing this page — please check back soon."
          />
        )}
      </section>
    </>
  );
}
