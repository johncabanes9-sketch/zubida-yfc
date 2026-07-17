import type { JSX } from "react";
import type { ZodTypeAny } from "zod";
import {
  heroSchema, textImageSchema, featureCardsSchema, valuesGridSchema, timelineSchema,
} from "./content-schemas";
import { ICON_NAMES } from "./icons";
import { HeroSection } from "@/components/pages/sections/hero-section";
import { TextImageSection } from "@/components/pages/sections/text-image-section";
import { FeatureCardsSection } from "@/components/pages/sections/feature-cards-section";
import { ValuesGridSection } from "@/components/pages/sections/values-grid-section";
import { TimelineSection } from "@/components/pages/sections/timeline-section";

// Field kinds the admin editor knows how to render (Task 7 consumes this).
export type EditorField =
  | { key: string; kind: "text" | "textarea"; label: string; optional?: boolean }
  | { key: string; kind: "image"; label: string }
  | { key: string; kind: "icon"; label: string }
  | { key: string; kind: "select"; label: string; options: string[] }
  | { key: string; kind: "list"; label: string; itemFields: EditorField[] };

export type SectionDef = {
  label: string;
  schema: ZodTypeAny;
  defaultContent: unknown;
  Component: (props: { content: any }) => JSX.Element;
  editorFields: EditorField[];
};

const ICON_FIELD = (key: string, label: string): EditorField => ({ key, kind: "icon", label });

export const REGISTRY: Record<string, SectionDef> = {
  hero: {
    label: "Hero banner",
    schema: heroSchema,
    defaultContent: { eyebrow: "Eyebrow", title: "Title", subtitle: "" },
    Component: HeroSection,
    editorFields: [
      { key: "eyebrow", kind: "text", label: "Eyebrow" },
      { key: "title", kind: "text", label: "Title" },
      { key: "subtitle", kind: "textarea", label: "Subtitle", optional: true },
    ],
  },
  "text-image": {
    label: "Text + image",
    schema: textImageSchema,
    defaultContent: {
      image: { src: "https://picsum.photos/seed/new/900/700", alt: "", width: 900, height: 700, objectPath: null },
      eyebrow: "Eyebrow", title: "Title", subtitle: "Subtitle", body: "Body text.",
    },
    Component: TextImageSection,
    editorFields: [
      { key: "image", kind: "image", label: "Image" },
      { key: "eyebrow", kind: "text", label: "Eyebrow" },
      { key: "title", kind: "text", label: "Title" },
      { key: "subtitle", kind: "textarea", label: "Subtitle" },
      { key: "body", kind: "textarea", label: "Body" },
    ],
  },
  "feature-cards": {
    label: "Feature cards",
    schema: featureCardsSchema,
    defaultContent: { cards: [{ icon: ICON_NAMES[0], title: "Card", body: "Body." }] },
    Component: FeatureCardsSection,
    editorFields: [
      { key: "cards", kind: "list", label: "Cards", itemFields: [
        ICON_FIELD("icon", "Icon"),
        { key: "title", kind: "text", label: "Title" },
        { key: "body", kind: "textarea", label: "Body" },
      ] },
    ],
  },
  "values-grid": {
    label: "Values grid",
    schema: valuesGridSchema,
    defaultContent: { eyebrow: "Eyebrow", title: "Title", align: "center", items: [{ icon: ICON_NAMES[0], title: "Value", text: "Text." }] },
    Component: ValuesGridSection,
    editorFields: [
      { key: "eyebrow", kind: "text", label: "Eyebrow" },
      { key: "title", kind: "text", label: "Title" },
      { key: "align", kind: "select", label: "Align", options: ["left", "center"] },
      { key: "items", kind: "list", label: "Items", itemFields: [
        ICON_FIELD("icon", "Icon"),
        { key: "title", kind: "text", label: "Title" },
        { key: "text", kind: "textarea", label: "Text" },
      ] },
    ],
  },
  timeline: {
    label: "Timeline",
    schema: timelineSchema,
    defaultContent: { eyebrow: "Eyebrow", title: "Title", subtitle: "", align: "center", milestones: [{ year: "2024", title: "Milestone", text: "Text." }] },
    Component: TimelineSection,
    editorFields: [
      { key: "eyebrow", kind: "text", label: "Eyebrow" },
      { key: "title", kind: "text", label: "Title" },
      { key: "subtitle", kind: "textarea", label: "Subtitle", optional: true },
      { key: "align", kind: "select", label: "Align", options: ["left", "center"] },
      { key: "milestones", kind: "list", label: "Milestones", itemFields: [
        { key: "year", kind: "text", label: "Year" },
        { key: "title", kind: "text", label: "Title" },
        { key: "text", kind: "textarea", label: "Text" },
      ] },
    ],
  },
};
