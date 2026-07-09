import type { Metadata } from "next";
import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeading } from "@/components/shared/section-heading";
import { ContactForm } from "@/components/contact/contact-form";
import { Faq } from "@/components/contact/faq";
import { Reveal } from "@/components/shared/reveal";
import { SITE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the Zubida YFC provincial office in Zamboanga del Sur.",
};

const contactItems = [
  { icon: MapPin, label: "Province Office", value: SITE.office },
  { icon: Mail, label: "Email", value: SITE.email, href: `mailto:${SITE.email}` },
  { icon: Phone, label: "Phone", value: SITE.phone, href: `tel:${SITE.phone}` },
];

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Let's talk — we'd love to hear from you"
        subtitle="Questions about joining, events, or partnering with Zubida YFC? Reach out and our provincial team will get back to you."
      />

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr]">
          {/* Info + map */}
          <div>
            <SectionHeading eyebrow="Reach Us" title="Come find us" />
            <div className="mt-8 space-y-4">
              {contactItems.map((c, i) => (
                <Reveal key={c.label} delay={i * 0.1}>
                  <div className="glass flex items-start gap-4 rounded-2xl p-5 shadow-card">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-500/15 text-gold-600 dark:text-gold-400">
                      <c.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted">
                        {c.label}
                      </p>
                      {c.href ? (
                        <a href={c.href} className="font-medium hover:text-royal-700 dark:hover:text-gold-300">
                          {c.value}
                        </a>
                      ) : (
                        <p className="font-medium">{c.value}</p>
                      )}
                    </div>
                  </div>
                </Reveal>
              ))}

              <Reveal delay={0.3}>
                <div className="flex gap-3">
                  <a
                    href={SITE.socials.facebook}
                    aria-label="Facebook"
                    className="glass grid h-12 w-12 place-items-center rounded-xl text-royal-700 shadow-card transition-colors hover:bg-royal-700/10 dark:text-gold-300"
                  >
                    <Facebook className="h-5 w-5" />
                  </a>
                  <a
                    href={SITE.socials.instagram}
                    aria-label="Instagram"
                    className="glass grid h-12 w-12 place-items-center rounded-xl text-royal-700 shadow-card transition-colors hover:bg-royal-700/10 dark:text-gold-300"
                  >
                    <Instagram className="h-5 w-5" />
                  </a>
                </div>
              </Reveal>

              {/* Stylized map placeholder */}
              <Reveal delay={0.35}>
                <div className="glass relative mt-2 aspect-[16/10] overflow-hidden rounded-3xl shadow-card">
                  <div className="absolute inset-0 bg-gradient-to-br from-royal-800 via-midnight-900 to-midnight-950" />
                  <svg viewBox="0 0 100 62" className="absolute inset-0 h-full w-full opacity-40">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <line key={`h${i}`} x1="0" y1={i * 10} x2="100" y2={i * 10} stroke="#3B6FE0" strokeWidth="0.2" />
                    ))}
                    {Array.from({ length: 11 }).map((_, i) => (
                      <line key={`v${i}`} x1={i * 10} y1="0" x2={i * 10} y2="62" stroke="#3B6FE0" strokeWidth="0.2" />
                    ))}
                    <path d="M20,44 Q40,20 62,32 Q80,40 84,24" fill="none" stroke="#F5B942" strokeWidth="0.8" strokeDasharray="1.5 1.5" />
                  </svg>
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-gold-500 text-midnight-900 shadow-glow motion-safe:animate-pulse-glow">
                      <MapPin className="h-6 w-6" />
                    </span>
                    <p className="mt-3 text-sm font-medium text-cream">Pagadian City</p>
                    <p className="text-xs text-cream/70">Zamboanga del Sur</p>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>

          {/* Form */}
          <div>
            <SectionHeading eyebrow="Send a Message" title="Drop us a line" />
            <div className="mt-8">
              <ContactForm />
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-24">
          <SectionHeading
            eyebrow="FAQ"
            title="Questions, answered"
            align="center"
          />
          <div className="mx-auto mt-12 max-w-3xl">
            <Faq />
          </div>
        </div>
      </section>
    </>
  );
}
