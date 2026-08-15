import Image from "next/image";
import { HeartHandshake, Sparkles, Users } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/shared/reveal";
import { isVerified } from "@/lib/content/fixtures";
import { cn } from "@/lib/utils";

const pillars = [
  { icon: Sparkles, title: "Evangelization", text: "Sharing the joy of the Gospel with every young person in the province." },
  { icon: Users, title: "Community", text: "Households where no one walks their faith journey alone." },
  { icon: HeartHandshake, title: "Service", text: "Faith made visible through missions in our barangays." },
];

export function AboutTeaser() {
  // The collage is picsum.photos stock captioned as YFC worship, households, and
  // missions. Without it the section runs as a single column rather than
  // illustrating the organization with photographs of unrelated people.
  const showPhotos = isVerified("photography");

  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div
        className={cn(
          "grid items-center gap-14",
          showPhotos ? "lg:grid-cols-2" : "mx-auto max-w-3xl",
        )}
      >
        {showPhotos && (
        <Reveal>
          <div className="relative">
            <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-radiant blur-2xl" />
            <div className="grid grid-cols-2 gap-4">
              <Image
                src="https://picsum.photos/seed/about-a/600/800"
                alt="YFC members in worship"
                width={600}
                height={800}
                className="h-full w-full rounded-3xl object-cover shadow-card"
              />
              <div className="mt-8 flex flex-col gap-4">
                <Image
                  src="https://picsum.photos/seed/about-b/600/500"
                  alt="YFC household gathering"
                  width={600}
                  height={500}
                  className="rounded-3xl object-cover shadow-card"
                />
                <Image
                  src="https://picsum.photos/seed/about-c/600/500"
                  alt="YFC mission activity"
                  width={600}
                  height={500}
                  className="rounded-3xl object-cover shadow-card"
                />
              </div>
            </div>
          </div>
        </Reveal>
        )}

        <div>
          <SectionHeading
            eyebrow="About Zubida YFC"
            title="A province-wide family setting the youth on fire for Christ"
            subtitle="Zubida YFC unites the chapters of Zamboanga del Sur into one movement of prayer, formation, and mission. We form young leaders who bring light into their schools, homes, and barangays."
          />
          <div className="mt-8 space-y-4">
            {pillars.map((p, i) => (
              <Reveal key={p.title} delay={0.1 + i * 0.1}>
                <div className="flex gap-4 rounded-2xl p-4 transition-colors hover:bg-royal-700/5 dark:hover:bg-white/5">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gold-500/15 text-gold-600 dark:text-gold-400">
                    <p.icon className="h-6 w-6" />
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-semibold">{p.title}</h3>
                    <p className="text-sm text-muted">{p.text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <ButtonLink href="/about" variant="outline" className="mt-8">
            Our full story
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
