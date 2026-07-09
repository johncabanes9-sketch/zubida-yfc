import type { Stat, Verse, Testimonial } from "./types";

export const stats: Stat[] = [
  { label: "Chapters", value: 26, suffix: "" },
  { label: "Active Members", value: 4200, suffix: "+" },
  { label: "Provincial Events", value: 58, suffix: "" },
  { label: "Trained Leaders", value: 340, suffix: "+" },
];

export const verses: Verse[] = [
  {
    text: "Don't let anyone look down on you because you are young, but set an example for the believers in speech, in conduct, in love, in faith and in purity.",
    reference: "1 Timothy 4:12",
  },
  {
    text: "For I know the plans I have for you, plans to prosper you and not to harm you, plans to give you hope and a future.",
    reference: "Jeremiah 29:11",
  },
  {
    text: "Let your light shine before others, that they may see your good deeds and glorify your Father in heaven.",
    reference: "Matthew 5:16",
  },
  {
    text: "I can do all things through Christ who strengthens me.",
    reference: "Philippians 4:13",
  },
  {
    text: "Be strong and courageous. Do not be afraid; for the Lord your God will be with you wherever you go.",
    reference: "Joshua 1:9",
  },
  {
    text: "Trust in the Lord with all your heart and lean not on your own understanding.",
    reference: "Proverbs 3:5",
  },
];

export const testimonials: Testimonial[] = [
  {
    id: "t1",
    name: "Angela Rose Delfin",
    role: "Chapter Member",
    chapter: "Pagadian City",
    quote:
      "YFC gave me a home when I felt most alone. I walked in a shy first-year student and found brothers and sisters who prayed with me until I believed I mattered to God.",
    avatar: "https://i.pravatar.cc/200?img=45",
  },
  {
    id: "t2",
    name: "Mark Jerome Tan",
    role: "Core Group Leader",
    chapter: "Molave",
    quote:
      "I used to think leadership was about being in front. Zubida YFC taught me it's about washing feet. Serving my chapter changed the way I see everyone.",
    avatar: "https://i.pravatar.cc/200?img=12",
  },
  {
    id: "t3",
    name: "Kristine Joy Alonzo",
    role: "Youth Camp Alumna",
    chapter: "Labangan",
    quote:
      "Camp was three days that rearranged my whole life. I came home and my family noticed the peace before I ever said a word about it.",
    avatar: "https://i.pravatar.cc/200?img=32",
  },
  {
    id: "t4",
    name: "John Paul Ceniza",
    role: "Chapter Head",
    chapter: "Tukuran",
    quote:
      "Every mission we run in the barangays reminds me: the youth of Zamboanga del Sur are not the future of the Church. We are the Church, right now.",
    avatar: "https://i.pravatar.cc/200?img=68",
  },
];
