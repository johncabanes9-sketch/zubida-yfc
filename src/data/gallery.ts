import type { Photo } from "./types";

const spans: Photo["span"][] = ["normal", "tall", "wide", "normal", "normal", "tall"];

export const gallery: Photo[] = [
  { id: "g1", src: "https://picsum.photos/seed/gal1/700/900", caption: "Worship at Provincial Youth Camp", category: "Youth Camp", span: "tall" },
  { id: "g2", src: "https://picsum.photos/seed/gal2/900/600", caption: "ICON main session", category: "ICON", span: "wide" },
  { id: "g3", src: "https://picsum.photos/seed/gal3/700/700", caption: "Household sharing circle", category: "Household", span: "normal" },
  { id: "g4", src: "https://picsum.photos/seed/gal4/700/900", caption: "Christian Life Seminar", category: "CLS", span: "tall" },
  { id: "g5", src: "https://picsum.photos/seed/gal5/700/700", caption: "Sports Fest opening parade", category: "Sports Fest", span: "normal" },
  { id: "g6", src: "https://picsum.photos/seed/gal6/900/600", caption: "Barangay feeding mission", category: "Mission Activities", span: "wide" },
  { id: "g7", src: "https://picsum.photos/seed/gal7/700/700", caption: "Provincial Conference plenary", category: "Provincial Conference", span: "normal" },
  { id: "g8", src: "https://picsum.photos/seed/gal8/700/900", caption: "Sunrise prayer at camp", category: "Youth Camp", span: "tall" },
  { id: "g9", src: "https://picsum.photos/seed/gal9/700/700", caption: "ICON worship team", category: "ICON", span: "normal" },
  { id: "g10", src: "https://picsum.photos/seed/gal10/900/600", caption: "Household game night", category: "Household", span: "wide" },
  { id: "g11", src: "https://picsum.photos/seed/gal11/700/700", caption: "CLS small group", category: "CLS", span: "normal" },
  { id: "g12", src: "https://picsum.photos/seed/gal12/700/900", caption: "Basketball finals", category: "Sports Fest", span: "tall" },
  { id: "g13", src: "https://picsum.photos/seed/gal13/700/700", caption: "Catechism for children", category: "Mission Activities", span: "normal" },
  { id: "g14", src: "https://picsum.photos/seed/gal14/900/600", caption: "Provincial Conference delegates", category: "Provincial Conference", span: "wide" },
  { id: "g15", src: "https://picsum.photos/seed/gal15/700/700", caption: "Candle-lighting commitment", category: "Youth Camp", span: "normal" },
  { id: "g16", src: "https://picsum.photos/seed/gal16/700/900", caption: "Praise & worship night", category: "ICON", span: "tall" },
  { id: "g17", src: "https://picsum.photos/seed/gal17/700/700", caption: "Household leaders' huddle", category: "Household", span: "normal" },
  { id: "g18", src: "https://picsum.photos/seed/gal18/900/600", caption: "Outreach in the barangays", category: "Mission Activities", span: "wide" },
];

export { spans };
