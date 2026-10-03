export type EventStatus = "Open" | "Closed" | "Finished";
export type EventScope = "Provincial" | "Chapter";

export type EventImage = { url: string; alt: string };

export interface EventItem {
  id: string;
  name: string;
  /** Nullable because events.cover is (0001), and an admin may publish an
   *  event before there is artwork for it. Declaring it `string` is what let
   *  the loader launder a null into "" and hand <Image> an empty src. */
  cover: string | null;
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
