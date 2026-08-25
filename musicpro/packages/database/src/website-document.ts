import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";
import {
  DEFAULT_WEBSITE_HUB_CONTENT,
  parseWebsiteHubContent,
  WEBSITE_HUB_SETTING_KEY,
  type WebsiteAppItem,
  type WebsiteHubContent,
  type WebsiteLink,
  type WebsiteSocialItem,
} from "./website-content";

type SettingsClient = SupabaseClient<Database>;

export const WEBSITE_HUB_DRAFT_KEY = "website_hub_draft";
export const WEBSITE_STORAGE_BUCKET = "website";
export const WEBSITE_HUB_PUBLIC_URL = "https://www.musicproeventi.it";

export const WEBSITE_BLOCK_TYPES = [
  "hero",
  "story",
  "apps",
  "rewavier",
  "reviews",
  "socials",
  "place",
] as const;

export type WebsiteBlockType = (typeof WEBSITE_BLOCK_TYPES)[number];

export type WebsiteStoryLayout = "text-list" | "text-photo" | "narrow" | "banner";

export type WebsiteStoryListItem = {
  label: string;
  href?: string;
};

export type WebsiteHeroData = {
  kicker: string;
  title: string;
  lede: string;
  cta1: WebsiteLink;
  cta2: WebsiteLink;
};

export type WebsiteStoryData = {
  kicker: string;
  title: string;
  paragraphs: string[];
  quote?: string;
  ctas: WebsiteLink[];
  image?: string;
  imageAlt?: string;
  listTitle?: string;
  list?: WebsiteStoryListItem[];
  layout: WebsiteStoryLayout;
};

export type WebsiteAppsData = {
  kicker: string;
  title: string;
  lede: string;
  items: WebsiteAppItem[];
};

export type WebsiteRewavierData = {
  kicker: string;
  title: string;
  paragraphs: string[];
  cta: WebsiteLink;
};

export type WebsiteReviewsData = {
  kicker: string;
  title: string;
  lede: string;
  items: string[];
  cta1: WebsiteLink;
  cta2: WebsiteLink;
};

export type WebsiteSocialsData = {
  kicker: string;
  title: string;
  lede: string;
  items: WebsiteSocialItem[];
};

export type WebsitePlaceData = WebsiteHubContent["sede"];

export type WebsiteHeroBlock = {
  id: string;
  type: "hero";
  hidden: boolean;
  data: WebsiteHeroData;
};
export type WebsiteStoryBlock = {
  id: string;
  type: "story";
  hidden: boolean;
  data: WebsiteStoryData;
};
export type WebsiteAppsBlock = {
  id: string;
  type: "apps";
  hidden: boolean;
  data: WebsiteAppsData;
};
export type WebsiteRewavierBlock = {
  id: string;
  type: "rewavier";
  hidden: boolean;
  data: WebsiteRewavierData;
};
export type WebsiteReviewsBlock = {
  id: string;
  type: "reviews";
  hidden: boolean;
  data: WebsiteReviewsData;
};
export type WebsiteSocialsBlock = {
  id: string;
  type: "socials";
  hidden: boolean;
  data: WebsiteSocialsData;
};
export type WebsitePlaceBlock = {
  id: string;
  type: "place";
  hidden: boolean;
  data: WebsitePlaceData;
};

export type WebsiteHomeBlock =
  | WebsiteHeroBlock
  | WebsiteStoryBlock
  | WebsiteAppsBlock
  | WebsiteRewavierBlock
  | WebsiteReviewsBlock
  | WebsiteSocialsBlock
  | WebsitePlaceBlock;

export type WebsiteHubDocumentV2 = {
  version: 2;
  previewToken?: string;
  publishedAt?: string;
  site: {
    seo: WebsiteHubContent["seo"];
    nav: WebsiteHubContent["nav"];
    contact: WebsiteHubContent["contact"];
    footer: WebsiteHubContent["footer"];
  };
  home: { blocks: WebsiteHomeBlock[] };
  pages: WebsiteHubContent["pages"];
};

export const WEBSITE_BLOCK_TYPE_LABELS: Record<WebsiteBlockType, string> = {
  hero: "Inizio",
  story: "Storia",
  apps: "App",
  rewavier: "ReWavier",
  reviews: "Recensioni",
  socials: "Social",
  place: "Sede",
};

export const WEBSITE_STORY_LAYOUT_LABELS: Record<WebsiteStoryLayout, string> = {
  "text-list": "Testo + elenco",
  "text-photo": "Testo + foto",
  narrow: "Stretto",
  banner: "Banner",
};

const EMPTY_LINK: WebsiteLink = { label: "", href: "" };

const EMPTY_PLACE: WebsitePlaceData = {
  kicker: "",
  title: "",
  lede: "",
  legal: "",
  address: "",
  email: "",
  phone: "",
  phoneHref: "",
  cta1: { ...EMPTY_LINK },
  mapsGoogle: { ...EMPTY_LINK },
  mapsApple: { ...EMPTY_LINK },
  image1: "",
  image2: "",
  image1Alt: "",
  image2Alt: "",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDeep<T>(base: T, patch: unknown): T {
  if (!isObject(base)) {
    return (patch === undefined || patch === null ? base : patch) as T;
  }
  if (!isObject(patch)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = (base as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      out[key] = value;
    } else if (isObject(current) && isObject(value)) {
      out[key] = mergeDeep(current, value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

function newBlockId(type?: WebsiteBlockType): string {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  return type ? `${type}-${suffix}` : `block-${suffix}`;
}

export function countVisibleBlocks(
  blocks: WebsiteHomeBlock[],
  type: WebsiteBlockType,
): number {
  return blocks.filter((block) => block.type === type && !block.hidden).length;
}

export function createPreviewToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function previewTokensMatch(
  expected: string | undefined,
  given: string,
): boolean {
  const left = expected?.trim() ?? "";
  const right = given.trim();
  if (!left || !right) return false;
  const max = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < max; i += 1) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export class WebsiteHubInputError extends Error {
  constructor(message = "Documento sito non valido.") {
    super(message);
    this.name = "WebsiteHubInputError";
  }
}

function instrumentToListItem(label: string): WebsiteStoryListItem {
  const normalized = label.trim().toLowerCase();
  if (normalized === "canto" || normalized.startsWith("canto ")) {
    return { label, href: "canto.html" };
  }
  if (normalized.includes("propedeutica")) {
    return { label, href: "kids.html" };
  }
  return { label };
}

function asLink(value: unknown, fallback: WebsiteLink = EMPTY_LINK): WebsiteLink {
  if (!isObject(value)) return { ...fallback };
  return {
    label: typeof value.label === "string" ? value.label : fallback.label,
    href: typeof value.href === "string" ? value.href : fallback.href,
  };
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown, fallback: string[] = []): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

function asLinks(value: unknown, fallback: WebsiteLink[] = []): WebsiteLink[] {
  return Array.isArray(value) ? value.map((item) => asLink(item)) : fallback;
}

export function isWebsiteDocumentV2(value: unknown): value is WebsiteHubDocumentV2 {
  if (!isObject(value) || value.version !== 2) return false;
  const home = value.home;
  return isObject(home) && Array.isArray(home.blocks);
}

export function migrateV1ToV2(v1: WebsiteHubContent): WebsiteHubDocumentV2 {
  return {
    version: 2,
    site: {
      seo: v1.seo,
      nav: v1.nav,
      contact: v1.contact,
      footer: v1.footer,
    },
    home: {
      blocks: [
        { id: "inizio", type: "hero", hidden: false, data: { ...v1.hero } },
        {
          id: "scuola",
          type: "story",
          hidden: false,
          data: {
            kicker: v1.scuola.kicker,
            title: v1.scuola.title,
            paragraphs: [v1.scuola.p1, v1.scuola.p2],
            ctas: [v1.scuola.cta1, v1.scuola.cta2],
            listTitle: v1.scuola.listTitle,
            list: v1.scuola.instruments.map(instrumentToListItem),
            layout: "text-list",
          },
        },
        {
          id: "propedeutica",
          type: "story",
          hidden: false,
          data: {
            kicker: v1.propedeutica.kicker,
            title: v1.propedeutica.title,
            paragraphs: [v1.propedeutica.p1, v1.propedeutica.p2],
            quote: v1.propedeutica.quote,
            ctas: [{ label: v1.propedeutica.cta, href: "index.html#scrivi" }],
            image: v1.propedeutica.image,
            imageAlt: v1.propedeutica.imageAlt,
            layout: "text-photo",
          },
        },
        {
          id: "sale",
          type: "story",
          hidden: false,
          data: {
            kicker: v1.sale.kicker,
            title: v1.sale.title,
            paragraphs: [v1.sale.p1, v1.sale.p2],
            ctas: [v1.sale.cta1, v1.sale.cta2],
            listTitle: v1.sale.listTitle,
            list: v1.sale.bullets.map((label) => ({ label })),
            image: v1.sale.image,
            imageAlt: v1.sale.imageAlt,
            layout: "text-photo",
          },
        },
        { id: "app", type: "apps", hidden: false, data: { ...v1.apps } },
        {
          id: "rewavier",
          type: "rewavier",
          hidden: false,
          data: {
            kicker: v1.rewavier.kicker,
            title: v1.rewavier.title,
            paragraphs: [v1.rewavier.p1, v1.rewavier.p2, v1.rewavier.p3],
            cta: v1.rewavier.cta,
          },
        },
        {
          id: "cervellone",
          type: "story",
          hidden: false,
          data: {
            kicker: v1.cervellone.kicker,
            title: v1.cervellone.title,
            paragraphs: [v1.cervellone.p1, v1.cervellone.p2],
            ctas: [v1.cervellone.cta1, v1.cervellone.cta2, v1.cervellone.cta3],
            image: v1.cervellone.image,
            imageAlt: v1.cervellone.imageAlt,
            layout: "banner",
          },
        },
        {
          id: "chi",
          type: "story",
          hidden: false,
          data: {
            kicker: v1.chi.kicker,
            title: v1.chi.title,
            paragraphs: [v1.chi.p1],
            ctas: [],
            image: v1.chi.image,
            imageAlt: v1.chi.imageAlt,
            layout: "banner",
          },
        },
        { id: "recensioni", type: "reviews", hidden: false, data: { ...v1.reviews } },
        { id: "social", type: "socials", hidden: false, data: { ...v1.socials } },
        { id: "sede", type: "place", hidden: false, data: { ...v1.sede } },
      ],
    },
    pages: v1.pages,
  };
}

export const DEFAULT_WEBSITE_HUB_DOCUMENT: WebsiteHubDocumentV2 = structuredClone(
  migrateV1ToV2(DEFAULT_WEBSITE_HUB_CONTENT),
);

function findBlock<T extends WebsiteBlockType>(
  blocks: WebsiteHomeBlock[],
  type: T,
  id: string,
  includeHidden: boolean,
): Extract<WebsiteHomeBlock, { type: T }> | undefined {
  return blocks.find(
    (block): block is Extract<WebsiteHomeBlock, { type: T }> =>
      block.id === id && block.type === type && (includeHidden || !block.hidden),
  );
}

function storyParagraphs(data: WebsiteStoryData, count: number): string[] {
  return Array.from({ length: count }, (_, index) => data.paragraphs[index] ?? "");
}

const EMPTY_V1_LINK: WebsiteLink = { label: "", href: "" };

function emptyV1Sections(): Pick<
  WebsiteHubContent,
  | "hero"
  | "scuola"
  | "propedeutica"
  | "sale"
  | "apps"
  | "rewavier"
  | "cervellone"
  | "chi"
  | "reviews"
  | "socials"
  | "sede"
> {
  return {
    hero: { kicker: "", title: "", lede: "", cta1: { ...EMPTY_V1_LINK }, cta2: { ...EMPTY_V1_LINK } },
    scuola: {
      kicker: "",
      title: "",
      p1: "",
      p2: "",
      cta1: { ...EMPTY_V1_LINK },
      cta2: { ...EMPTY_V1_LINK },
      listTitle: "",
      instruments: [],
    },
    propedeutica: {
      kicker: "",
      title: "",
      quote: "",
      p1: "",
      p2: "",
      cta: "",
      image: "",
      imageAlt: "",
    },
    sale: {
      kicker: "",
      title: "",
      p1: "",
      p2: "",
      cta1: { ...EMPTY_V1_LINK },
      cta2: { ...EMPTY_V1_LINK },
      listTitle: "",
      bullets: [],
      image: "",
      imageAlt: "",
    },
    apps: { kicker: "", title: "", lede: "", items: [] },
    rewavier: { kicker: "", title: "", p1: "", p2: "", p3: "", cta: { ...EMPTY_V1_LINK } },
    cervellone: {
      kicker: "",
      title: "",
      p1: "",
      p2: "",
      image: "",
      imageAlt: "",
      cta1: { ...EMPTY_V1_LINK },
      cta2: { ...EMPTY_V1_LINK },
      cta3: { ...EMPTY_V1_LINK },
    },
    chi: { kicker: "", title: "", p1: "", image: "", imageAlt: "" },
    reviews: {
      kicker: "",
      title: "",
      lede: "",
      items: [],
      cta1: { ...EMPTY_V1_LINK },
      cta2: { ...EMPTY_V1_LINK },
    },
    socials: { kicker: "", title: "", lede: "", items: [] },
    sede: structuredClone(EMPTY_PLACE),
  };
}

export function flattenV2ToV1(
  doc: WebsiteHubDocumentV2,
  options?: { includeHidden?: boolean },
): WebsiteHubContent {
  const includeHidden = options?.includeHidden === true;
  const blocks = doc.home.blocks;
  const empty = emptyV1Sections();
  const hero = findBlock(blocks, "hero", "inizio", includeHidden);
  const scuola = findBlock(blocks, "story", "scuola", includeHidden);
  const propedeutica = findBlock(blocks, "story", "propedeutica", includeHidden);
  const sale = findBlock(blocks, "story", "sale", includeHidden);
  const apps = findBlock(blocks, "apps", "app", includeHidden);
  const rewavier = findBlock(blocks, "rewavier", "rewavier", includeHidden);
  const cervellone = findBlock(blocks, "story", "cervellone", includeHidden);
  const chi = findBlock(blocks, "story", "chi", includeHidden);
  const reviews = findBlock(blocks, "reviews", "recensioni", includeHidden);
  const socials = findBlock(blocks, "socials", "social", includeHidden);
  const place = findBlock(blocks, "place", "sede", includeHidden);

  const scuolaData = scuola?.data;
  const propData = propedeutica?.data;
  const saleData = sale?.data;
  const rewavierData = rewavier?.data;
  const cervelloneData = cervellone?.data;
  const chiData = chi?.data;

  return {
    seo: doc.site.seo,
    nav: doc.site.nav,
    hero: hero?.data ?? empty.hero,
    scuola: scuolaData
      ? {
          kicker: scuolaData.kicker,
          title: scuolaData.title,
          p1: storyParagraphs(scuolaData, 2)[0],
          p2: storyParagraphs(scuolaData, 2)[1],
          cta1: scuolaData.ctas[0] ?? { ...EMPTY_V1_LINK },
          cta2: scuolaData.ctas[1] ?? { ...EMPTY_V1_LINK },
          listTitle: scuolaData.listTitle ?? "",
          instruments: (scuolaData.list ?? []).map((item) => item.label),
        }
      : empty.scuola,
    propedeutica: propData
      ? {
          kicker: propData.kicker,
          title: propData.title,
          quote: propData.quote ?? "",
          p1: storyParagraphs(propData, 2)[0],
          p2: storyParagraphs(propData, 2)[1],
          cta: propData.ctas[0]?.label ?? "",
          image: propData.image ?? "",
          imageAlt: propData.imageAlt ?? "",
        }
      : empty.propedeutica,
    sale: saleData
      ? {
          kicker: saleData.kicker,
          title: saleData.title,
          p1: storyParagraphs(saleData, 2)[0],
          p2: storyParagraphs(saleData, 2)[1],
          cta1: saleData.ctas[0] ?? { ...EMPTY_V1_LINK },
          cta2: saleData.ctas[1] ?? { ...EMPTY_V1_LINK },
          listTitle: saleData.listTitle ?? "",
          bullets: (saleData.list ?? []).map((item) => item.label),
          image: saleData.image ?? "",
          imageAlt: saleData.imageAlt ?? "",
        }
      : empty.sale,
    apps: apps?.data ?? empty.apps,
    rewavier: rewavierData
      ? {
          kicker: rewavierData.kicker,
          title: rewavierData.title,
          p1: rewavierData.paragraphs[0] ?? "",
          p2: rewavierData.paragraphs[1] ?? "",
          p3: rewavierData.paragraphs[2] ?? "",
          cta: rewavierData.cta,
        }
      : empty.rewavier,
    cervellone: cervelloneData
      ? {
          kicker: cervelloneData.kicker,
          title: cervelloneData.title,
          p1: storyParagraphs(cervelloneData, 2)[0],
          p2: storyParagraphs(cervelloneData, 2)[1],
          image: cervelloneData.image ?? "",
          imageAlt: cervelloneData.imageAlt ?? "",
          cta1: cervelloneData.ctas[0] ?? { ...EMPTY_V1_LINK },
          cta2: cervelloneData.ctas[1] ?? { ...EMPTY_V1_LINK },
          cta3: cervelloneData.ctas[2] ?? { ...EMPTY_V1_LINK },
        }
      : empty.cervellone,
    chi: chiData
      ? {
          kicker: chiData.kicker,
          title: chiData.title,
          p1: chiData.paragraphs[0] ?? "",
          image: chiData.image ?? "",
          imageAlt: chiData.imageAlt ?? "",
        }
      : empty.chi,
    reviews: reviews?.data ?? empty.reviews,
    socials: socials?.data ?? empty.socials,
    sede: place?.data ?? empty.sede,
    contact: doc.site.contact,
    footer: doc.site.footer,
    pages: doc.pages,
  };
}

function emptyHero(): WebsiteHeroData {
  return { kicker: "", title: "", lede: "", cta1: { ...EMPTY_LINK }, cta2: { ...EMPTY_LINK } };
}

function emptyStory(): WebsiteStoryData {
  return {
    kicker: "",
    title: "Nuova sezione",
    paragraphs: [""],
    ctas: [],
    layout: "text-photo",
  };
}

function emptyApps(): WebsiteAppsData {
  return { kicker: "", title: "", lede: "", items: [{ name: "", text: "", href: "", cta: "" }] };
}

function emptyRewavier(): WebsiteRewavierData {
  return { kicker: "", title: "", paragraphs: [""], cta: { ...EMPTY_LINK } };
}

function emptyReviews(): WebsiteReviewsData {
  return {
    kicker: "",
    title: "",
    lede: "",
    items: [],
    cta1: { ...EMPTY_LINK },
    cta2: { ...EMPTY_LINK },
  };
}

function emptySocials(): WebsiteSocialsData {
  return { kicker: "", title: "", lede: "", items: [{ name: "", handle: "", href: "" }] };
}

function emptyPlace(): WebsitePlaceData {
  return structuredClone(EMPTY_PLACE);
}

export function createEmptyBlock(
  type: WebsiteBlockType,
  id = newBlockId(type),
): WebsiteHomeBlock {
  switch (type) {
    case "hero":
      return { id, type, hidden: false, data: emptyHero() };
    case "story":
      return { id, type, hidden: false, data: emptyStory() };
    case "apps":
      return { id, type, hidden: false, data: emptyApps() };
    case "rewavier":
      return { id, type, hidden: false, data: emptyRewavier() };
    case "reviews":
      return { id, type, hidden: false, data: emptyReviews() };
    case "socials":
      return { id, type, hidden: false, data: emptySocials() };
    case "place":
      return { id, type, hidden: false, data: emptyPlace() };
  }
}

function normalizeStoryList(value: unknown): WebsiteStoryListItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => {
      if (typeof item === "string") return { label: item };
      if (!isObject(item) || typeof item.label !== "string") return null;
      return {
        label: item.label,
        href: typeof item.href === "string" ? item.href : undefined,
      };
    })
    .filter((item): item is WebsiteStoryListItem => item !== null);
}

function isStoryLayout(value: unknown): value is WebsiteStoryLayout {
  return value === "text-list" || value === "text-photo" || value === "narrow" || value === "banner";
}

function normalizeBlock(raw: unknown): WebsiteHomeBlock | null {
  if (!isObject(raw) || typeof raw.type !== "string") return null;
  if (!WEBSITE_BLOCK_TYPES.includes(raw.type as WebsiteBlockType)) return null;
  const type = raw.type as WebsiteBlockType;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : newBlockId(type);
  const hidden = raw.hidden === true;
  const data = isObject(raw.data) ? raw.data : {};
  const empty = createEmptyBlock(type, id);

  switch (type) {
    case "hero":
      return {
        id,
        type,
        hidden,
        data: {
          kicker: asString(data.kicker),
          title: asString(data.title),
          lede: asString(data.lede),
          cta1: asLink(data.cta1),
          cta2: asLink(data.cta2),
        },
      };
    case "story":
      return {
        id,
        type,
        hidden,
        data: {
          kicker: asString(data.kicker),
          title: asString(data.title, empty.data && "title" in empty.data ? (empty.data as WebsiteStoryData).title : "Nuova sezione"),
          paragraphs: asStringArray(data.paragraphs, [""]),
          quote: typeof data.quote === "string" ? data.quote : undefined,
          ctas: asLinks(data.ctas),
          image: typeof data.image === "string" ? data.image : undefined,
          imageAlt: typeof data.imageAlt === "string" ? data.imageAlt : undefined,
          listTitle: typeof data.listTitle === "string" ? data.listTitle : undefined,
          list: normalizeStoryList(data.list),
          layout: isStoryLayout(data.layout) ? data.layout : "text-photo",
        },
      };
    case "apps":
      return {
        id,
        type,
        hidden,
        data: {
          kicker: asString(data.kicker),
          title: asString(data.title),
          lede: asString(data.lede),
          items: Array.isArray(data.items)
            ? data.items.map((item) => {
                const row = isObject(item) ? item : {};
                return {
                  name: asString(row.name),
                  text: asString(row.text),
                  href: asString(row.href),
                  cta: asString(row.cta),
                };
              })
            : emptyApps().items,
        },
      };
    case "rewavier":
      return {
        id,
        type,
        hidden,
        data: {
          kicker: asString(data.kicker),
          title: asString(data.title),
          paragraphs: asStringArray(data.paragraphs, [""]),
          cta: asLink(data.cta),
        },
      };
    case "reviews":
      return {
        id,
        type,
        hidden,
        data: {
          kicker: asString(data.kicker),
          title: asString(data.title),
          lede: asString(data.lede),
          items: asStringArray(data.items),
          cta1: asLink(data.cta1),
          cta2: asLink(data.cta2),
        },
      };
    case "socials":
      return {
        id,
        type,
        hidden,
        data: {
          kicker: asString(data.kicker),
          title: asString(data.title),
          lede: asString(data.lede),
          items: Array.isArray(data.items)
            ? data.items.map((item) => {
                const row = isObject(item) ? item : {};
                return {
                  name: asString(row.name),
                  handle: asString(row.handle),
                  href: asString(row.href),
                };
              })
            : emptySocials().items,
        },
      };
    case "place":
      return {
        id,
        type,
        hidden,
        data: mergeDeep(emptyPlace(), data),
      };
  }
}

function normalizeDocument(raw: Record<string, unknown>): WebsiteHubDocumentV2 {
  const site = isObject(raw.site) ? raw.site : {};
  const pages = isObject(raw.pages) ? raw.pages : {};
  const home = isObject(raw.home) ? raw.home : {};
  const blocks = Array.isArray(home.blocks) ? home.blocks : [];
  return {
    version: 2,
    previewToken:
      typeof raw.previewToken === "string" && raw.previewToken.trim()
        ? raw.previewToken.trim()
        : undefined,
    publishedAt: typeof raw.publishedAt === "string" && raw.publishedAt ? raw.publishedAt : undefined,
    site: {
      seo: mergeDeep(structuredClone(DEFAULT_WEBSITE_HUB_CONTENT.seo), site.seo),
      nav: mergeDeep(structuredClone(DEFAULT_WEBSITE_HUB_CONTENT.nav), site.nav),
      contact: mergeDeep(structuredClone(DEFAULT_WEBSITE_HUB_CONTENT.contact), site.contact),
      footer: mergeDeep(structuredClone(DEFAULT_WEBSITE_HUB_CONTENT.footer), site.footer),
    },
    home: {
      blocks: blocks
        .map(normalizeBlock)
        .filter((block): block is WebsiteHomeBlock => block !== null),
    },
    pages: mergeDeep(structuredClone(DEFAULT_WEBSITE_HUB_CONTENT.pages), pages),
  };
}

function isEmptySetting(raw: string | null | undefined): boolean {
  return !raw || !raw.trim() || raw.trim() === "{}";
}

export function parseWebsiteHubDocument(raw: string | null | undefined): WebsiteHubDocumentV2 {
  if (isEmptySetting(raw)) {
    return structuredClone(DEFAULT_WEBSITE_HUB_DOCUMENT);
  }
  try {
    const parsed = JSON.parse(raw as string) as unknown;
    if (isWebsiteDocumentV2(parsed)) {
      return normalizeDocument(parsed as Record<string, unknown>);
    }
    if (isObject(parsed) && parsed.version === 2) {
      return structuredClone(DEFAULT_WEBSITE_HUB_DOCUMENT);
    }
    return migrateV1ToV2(parseWebsiteHubContent(raw));
  } catch {
    return structuredClone(DEFAULT_WEBSITE_HUB_DOCUMENT);
  }
}

/** Accetta documento v2 completo o oggetto piatto v1. Non accetta token/publishedAt dal client. */
export function parseWebsiteHubInput(body: unknown): WebsiteHubDocumentV2 {
  if (isObject(body) && body.version === 2) {
    if (!isWebsiteDocumentV2(body)) {
      throw new WebsiteHubInputError("Documento v2 non valido: manca home.blocks.");
    }
    const doc = normalizeDocument(body);
    delete doc.previewToken;
    delete doc.publishedAt;
    return doc;
  }
  const doc = migrateV1ToV2(parseWebsiteHubContent(JSON.stringify(body ?? {})));
  delete doc.previewToken;
  delete doc.publishedAt;
  return doc;
}

function canonicalDocument(doc: WebsiteHubDocumentV2): string {
  const { previewToken: _token, publishedAt: _published, ...rest } = doc;
  return JSON.stringify(rest);
}

export function websiteDocumentsEqual(
  left: WebsiteHubDocumentV2,
  right: WebsiteHubDocumentV2,
): boolean {
  return canonicalDocument(left) === canonicalDocument(right);
}

export function toPublicWebsiteContent(
  doc: WebsiteHubDocumentV2,
  options?: { preview?: boolean },
): Record<string, unknown> {
  const v1 = flattenV2ToV1(doc, { includeHidden: options?.preview === true });
  const blocks = options?.preview
    ? doc.home.blocks
    : doc.home.blocks.filter((block) => !block.hidden);
  return {
    ...v1,
    version: 2,
    site: doc.site,
    home: { blocks },
    pages: doc.pages,
    ...(doc.publishedAt ? { publishedAt: doc.publishedAt } : {}),
  };
}

export function previewUrlForToken(token: string, hubOrigin = WEBSITE_HUB_PUBLIC_URL): string {
  const url = new URL(hubOrigin);
  url.searchParams.set("preview", token);
  return url.toString();
}

async function readSetting(client: SettingsClient, key: string): Promise<string | null> {
  const { data } = await client.from("app_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

async function writeSetting(
  client: SettingsClient,
  key: string,
  value: string,
  description: string,
): Promise<{ success: boolean; errorMessage?: string }> {
  const { error } = await client.from("app_settings").upsert(
    { key, value, description },
    { onConflict: "key" },
  );
  if (error) {
    return { success: false, errorMessage: error.message };
  }
  return { success: true };
}

export async function getWebsitePublished(
  client: SettingsClient,
): Promise<WebsiteHubDocumentV2> {
  return parseWebsiteHubDocument(await readSetting(client, WEBSITE_HUB_SETTING_KEY));
}

export async function getWebsiteDraft(client: SettingsClient): Promise<WebsiteHubDocumentV2> {
  const raw = await readSetting(client, WEBSITE_HUB_DRAFT_KEY);
  if (isEmptySetting(raw)) {
    return getWebsitePublished(client);
  }
  return parseWebsiteHubDocument(raw);
}

export async function isWebsiteDraftDirty(client: SettingsClient): Promise<boolean> {
  const raw = await readSetting(client, WEBSITE_HUB_DRAFT_KEY);
  if (isEmptySetting(raw)) return false;
  const [draft, published] = await Promise.all([
    parseWebsiteHubDocument(raw),
    getWebsitePublished(client),
  ]);
  return !websiteDocumentsEqual(draft, published);
}

export async function getWebsiteAdminState(client: SettingsClient): Promise<{
  draft: WebsiteHubDocumentV2;
  published: WebsiteHubDocumentV2;
  dirty: boolean;
}> {
  const [draftRaw, published] = await Promise.all([
    readSetting(client, WEBSITE_HUB_DRAFT_KEY),
    getWebsitePublished(client),
  ]);
  const draft = isEmptySetting(draftRaw)
    ? structuredClone(published)
    : parseWebsiteHubDocument(draftRaw);
  return {
    draft,
    published,
    dirty: isEmptySetting(draftRaw) ? false : !websiteDocumentsEqual(draft, published),
  };
}

export async function saveWebsiteDraft(
  client: SettingsClient,
  input: WebsiteHubDocumentV2,
  options?: { rotatePreviewToken?: boolean },
): Promise<{ success: boolean; draft?: WebsiteHubDocumentV2; errorMessage?: string }> {
  const currentRaw = await readSetting(client, WEBSITE_HUB_DRAFT_KEY);
  const currentToken = isEmptySetting(currentRaw)
    ? undefined
    : parseWebsiteHubDocument(currentRaw).previewToken;
  const draft: WebsiteHubDocumentV2 = {
    ...input,
    previewToken: options?.rotatePreviewToken
      ? createPreviewToken()
      : currentToken || createPreviewToken(),
  };
  delete draft.publishedAt;
  const result = await writeSetting(
    client,
    WEBSITE_HUB_DRAFT_KEY,
    JSON.stringify(draft),
    "Bozza JSON del sito hub musicproeventi.it. Pubblica copia su website_hub_content.",
  );
  if (!result.success) return result;
  return { success: true, draft };
}

export async function publishWebsite(
  client: SettingsClient,
): Promise<{ success: boolean; published?: WebsiteHubDocumentV2; errorMessage?: string }> {
  const draft = await getWebsiteDraft(client);
  const published: WebsiteHubDocumentV2 = {
    ...draft,
    publishedAt: new Date().toISOString(),
  };
  delete published.previewToken;
  const result = await writeSetting(
    client,
    WEBSITE_HUB_SETTING_KEY,
    JSON.stringify(published),
    "JSON pubblicato del sito hub musicproeventi.it",
  );
  if (!result.success) return result;
  return { success: true, published };
}

export async function revertWebsiteDraft(
  client: SettingsClient,
): Promise<{ success: boolean; draft?: WebsiteHubDocumentV2; errorMessage?: string }> {
  const [published, current] = await Promise.all([
    getWebsitePublished(client),
    getWebsiteDraft(client),
  ]);
  const draft: WebsiteHubDocumentV2 = {
    ...published,
    previewToken: current.previewToken || createPreviewToken(),
  };
  delete draft.publishedAt;
  return saveWebsiteDraft(client, draft);
}

export async function rotateWebsitePreviewToken(
  client: SettingsClient,
): Promise<{ success: boolean; draft?: WebsiteHubDocumentV2; errorMessage?: string }> {
  const draft = await getWebsiteDraft(client);
  return saveWebsiteDraft(client, draft, { rotatePreviewToken: true });
}

export async function getWebsiteHubContent(
  client: SettingsClient,
): Promise<WebsiteHubContent> {
  return flattenV2ToV1(await getWebsitePublished(client));
}

export async function saveWebsiteHubContent(
  client: SettingsClient,
  content: WebsiteHubContent,
): Promise<{ success: boolean; errorMessage?: string }> {
  return saveWebsiteDraft(client, migrateV1ToV2(content));
}
