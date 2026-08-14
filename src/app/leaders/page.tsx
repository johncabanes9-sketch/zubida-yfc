import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { LeadersDirectory } from "@/components/leaders/leaders-directory";
import { UnpublishedNotice } from "@/components/shared/unpublished-notice";
import { isVerified } from "@/lib/content/fixtures";

export const metadata: Metadata = {
  title: "Leaders",
  description:
    "Meet the provincial coordinators, area heads, chapter heads, and core group leaders of Zubida YFC.",
};

export default function LeadersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Our Leaders"
        title="The servants behind the mission"
        subtitle="From provincial coordinators to core group leaders — meet the people who pray, plan, and pour themselves out for the youth of Zamboanga del Sur."
      />
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        {isVerified("leaders") ? (
          <LeadersDirectory />
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
