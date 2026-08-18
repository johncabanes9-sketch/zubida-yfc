export type EventStatus = "Open" | "Closed" | "Finished";
export type EventScope = "Provincial" | "Chapter";

export type EventImage = { url: string; alt: string };

export interface EventItem {
  id: string;
  name: string;
  cover: string;
  date: string; // ISO
  time: string;
  venue: string;
  organizer: string;
  description: string;
  registrationDeadline: string; // ISO
  slotsTotal: number;
  slotsTaken: number;
  status: EventStatus;
  scope: EventScope;
  images?: EventImage[];
}

export type NewsCategory =
  | "Announcement"
  | "Article"
  | "Blog"
  | "Video";

export interface NewsItem {
  id: string;
  title: string;
  excerpt: string;
  category: NewsCategory;
  date: string; // ISO
  author: string;
  cover: string;
  readTime: number;
}

export type GalleryCategory =
  | "Youth Camp"
  | "Provincial Conference"
  | "ICON"
  | "Household"
  | "CLS"
  | "Sports Fest"
  | "Mission Activities";

export interface Photo {
  id: string;
  src: string;
  caption: string;
  category: GalleryCategory;
  span: "tall" | "wide" | "normal";
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  chapter: string;
  quote: string;
  avatar: string;
}

export interface Stat {
  label: string;
  value: number;
  suffix?: string;
}

export interface Verse {
  text: string;
  reference: string;
}
