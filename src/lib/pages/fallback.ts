import type { RenderableSection } from "@/components/pages/section-renderer";

export type PageMeta = { title: string; seoTitle: string; seoDescription: string; ogImage: string | null };

// Mirrors the About seed in migration 0016. Guarantees the public page renders
// even if the DB is unreachable or unseeded, exactly like getSiteSettings.
const ABOUT: { meta: PageMeta; sections: RenderableSection[] } = {
  meta: {
    title: "About",
    seoTitle: "About",
    seoDescription:
      "Who we are, our mission and vision, core values, and the history of Youth for Christ in Zamboanga del Sur.",
    ogImage: null,
  },
  sections: [
    { type: "hero", content: { eyebrow: "About Zubida YFC", title: "One Province. One Mission. One Christ.", subtitle: "We are the official Youth for Christ community of Zamboanga del Sur — a family of young people set ablaze by the love of God and sent to set the province on fire." } },
    { type: "text-image", content: { image: { src: "https://picsum.photos/seed/whoweare/900/700", alt: "Zubida YFC community gathered in worship", width: 900, height: 700, objectPath: null }, eyebrow: "Who We Are", title: "A movement of young missionaries", subtitle: "Youth for Christ is a covenant community and evangelistic movement within Couples for Christ, forming young people ages 12 to 21 into Christ-centered leaders.", body: "In Zamboanga del Sur, we call ourselves Zubida YFC — twenty-six chapters across the province, bound by one covenant of prayer, formation, and mission. We gather in households, worship in conferences, serve in barangays, and walk with one another through the ordinary and extraordinary moments of growing up in faith." } },
    { type: "feature-cards", content: { cards: [{ icon: "Compass", title: "Our Mission", body: "To bring the youth of Zamboanga del Sur to a personal relationship with Jesus Christ, to form them into mature Christian leaders, and to send them out as joyful missionaries in their families, schools, and communities." }, { icon: "Eye", title: "Our Vision", body: "A province where every young person knows they are loved by God, every chapter is a home of holiness and joy, and a new generation of leaders rises to renew the Church and transform Zamboanga del Sur for Christ." }] } },
    { type: "values-grid", content: { eyebrow: "Core Values", title: "What holds us together", align: "center", items: [{ icon: "Flame", title: "Christ-Centeredness", text: "Everything begins and ends with Jesus. He is our reason, our method, and our goal." }, { icon: "Users", title: "Family & Household", text: "We grow in small households where faith becomes personal and no one is left behind." }, { icon: "HandHeart", title: "Servant Leadership", text: "To lead is to serve. Our leaders wash feet before they take the stage." }, { icon: "Sparkles", title: "Joyful Evangelization", text: "We share the Gospel with the contagious joy that only Christ can give." }, { icon: "Compass", title: "Integrity", text: "We strive to be the same person on stage, at home, and in the barangay." }, { icon: "Eye", title: "Missionary Heart", text: "We are sent — to our schools, our families, and the farthest chapel of the province." }] } },
    { type: "timeline", content: { eyebrow: "Our History", title: "Two decades of grace in Zamboanga del Sur", subtitle: "From a small prayer group in Pagadian to a province-wide movement — this is how far God has carried us.", align: "center", milestones: [{ year: "2003", title: "The First Spark", text: "A handful of students in Pagadian City begin gathering to pray and share the Gospel — the seed of Youth for Christ in Zamboanga del Sur." }, { year: "2008", title: "Chapters Multiply", text: "The movement spreads north to Molave and Mahayag. The first provincial youth camp draws over 200 delegates." }, { year: "2013", title: "Clusters Formed", text: "Chapters organize into Bay, North, and South clusters, giving every municipality a spiritual home and closer formation." }, { year: "2017", title: "ICON is Born", text: "The Ignite Conference launches as the province's flagship annual gathering, commissioning a new wave of young leaders." }, { year: "2020", title: "Faith Online", text: "When the world stops, the households don't. Zubida YFC moves to virtual gatherings, keeping the youth connected through the pandemic." }, { year: "2024", title: "One Province, One Mission", text: "With 26 chapters and thousands of members, Zubida YFC adopts its unifying vision: One Province. One Mission. One Christ." }] } },
  ],
};

export const PAGE_FALLBACK: Record<string, { meta: PageMeta; sections: RenderableSection[] }> = { about: ABOUT };
