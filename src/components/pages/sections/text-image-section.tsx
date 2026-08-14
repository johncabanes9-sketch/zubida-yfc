import Image from "next/image";
import { SectionHeading } from "@/components/shared/section-heading";
import { Reveal } from "@/components/shared/reveal";
import type { TextImageContent } from "@/lib/pages/content-schemas";

export function TextImageSection({ content }: { content: TextImageContent }) {
  const { image } = content;
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div
        className={
          image
            ? "grid items-center gap-14 lg:grid-cols-2"
            : "mx-auto grid max-w-3xl items-center gap-14"
        }
      >
        {image && (
          <Reveal>
            <div className="relative">
              <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-radiant blur-2xl" />
              <Image
                src={image.src}
                alt={image.alt}
                width={image.width}
                height={image.height}
                className="w-full rounded-3xl object-cover shadow-card"
              />
            </div>
          </Reveal>
        )}
        <div>
          <SectionHeading eyebrow={content.eyebrow} title={content.title} subtitle={content.subtitle} />
          <p className="mt-6 leading-relaxed text-muted">{content.body}</p>
        </div>
      </div>
    </section>
  );
}
