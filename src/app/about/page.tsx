import type { Metadata } from "next";
import Image from "next/image";
import { Compass, Eye, Flame, HandHeart, Sparkles, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeading } from "@/components/shared/section-heading";
import { Reveal } from "@/components/shared/reveal";
import { Timeline } from "@/components/about/timeline";
import { Sunburst } from "@/components/shared/sunburst";

export const metadata: Metadata = {
  title: "About",
  description:
    "Who we are, our mission and vision, core values, and the history of Youth for Christ in Zamboanga del Sur.",
};

const values = [
  { icon: Flame, title: "Christ-Centeredness", text: "Everything begins and ends with Jesus. He is our reason, our method, and our goal." },
  { icon: Users, title: "Family & Household", text: "We grow in small households where faith becomes personal and no one is left behind." },
  { icon: HandHeart, title: "Servant Leadership", text: "To lead is to serve. Our leaders wash feet before they take the stage." },
  { icon: Sparkles, title: "Joyful Evangelization", text: "We share the Gospel with the contagious joy that only Christ can give." },
  { icon: Compass, title: "Integrity", text: "We strive to be the same person on stage, at home, and in the barangay." },
  { icon: Eye, title: "Missionary Heart", text: "We are sent — to our schools, our families, and the farthest chapel of the province." },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About Zubida YFC"
        title="One Province. One Mission. One Christ."
        subtitle="We are the official Youth for Christ community of Zamboanga del Sur — a family of young people set ablaze by the love of God and sent to set the province on fire."
      />

      {/* Who we are */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <div className="relative">
              <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-radiant blur-2xl" />
              <Image
                src="https://picsum.photos/seed/whoweare/900/700"
                alt="Zubida YFC community gathered in worship"
                width={900}
                height={700}
                className="w-full rounded-3xl object-cover shadow-card"
              />
            </div>
          </Reveal>
          <div>
            <SectionHeading
              eyebrow="Who We Are"
              title="A movement of young missionaries"
              subtitle="Youth for Christ is a covenant community and evangelistic movement within Couples for Christ, forming young people ages 12 to 21 into Christ-centered leaders."
            />
            <p className="mt-6 leading-relaxed text-muted">
              In Zamboanga del Sur, we call ourselves Zubida YFC — twenty-six
              chapters across the province, bound by one covenant of prayer,
              formation, and mission. We gather in households, worship in
              conferences, serve in barangays, and walk with one another through
              the ordinary and extraordinary moments of growing up in faith.
            </p>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="bg-cream-100 py-24 dark:bg-midnight-900/40">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 md:grid-cols-2 lg:px-8">
          <Reveal>
            <div className="glass h-full rounded-3xl p-8 shadow-card sm:p-10">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-dawn-soft text-gold-300">
                <Compass className="h-7 w-7" />
              </span>
              <h3 className="mt-6 font-display text-2xl font-semibold">Our Mission</h3>
              <p className="mt-4 leading-relaxed text-muted">
                To bring the youth of Zamboanga del Sur to a personal
                relationship with Jesus Christ, to form them into mature
                Christian leaders, and to send them out as joyful missionaries in
                their families, schools, and communities.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="glass h-full rounded-3xl p-8 shadow-card sm:p-10">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gold-500 text-midnight-900">
                <Eye className="h-7 w-7" />
              </span>
              <h3 className="mt-6 font-display text-2xl font-semibold">Our Vision</h3>
              <p className="mt-4 leading-relaxed text-muted">
                A province where every young person knows they are loved by God,
                every chapter is a home of holiness and joy, and a new generation
                of leaders rises to renew the Church and transform Zamboanga del
                Sur for Christ.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Core values */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Core Values"
          title="What holds us together"
          align="center"
        />
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {values.map((v, i) => (
            <Reveal key={v.title} delay={(i % 3) * 0.1}>
              <div className="glass h-full rounded-3xl p-7 shadow-card transition-transform duration-300 hover:-translate-y-1.5">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-gold-500/15 text-gold-600 dark:text-gold-400">
                  <v.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{v.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* History timeline */}
      <section className="relative overflow-hidden bg-cream-100 py-24 dark:bg-midnight-900/40">
        <div className="pointer-events-none absolute -left-24 top-1/3 text-gold-400/5">
          <Sunburst className="h-96 w-96" rays={24} />
        </div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Our History"
            title="Two decades of grace in Zamboanga del Sur"
            subtitle="From a small prayer group in Pagadian to a province-wide movement — this is how far God has carried us."
            align="center"
          />
          <div className="mt-16">
            <Timeline />
          </div>
        </div>
      </section>
    </>
  );
}
