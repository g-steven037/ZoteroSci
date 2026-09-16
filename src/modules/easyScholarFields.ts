import { PublicationRankResult, queryPublicationRank } from "./easyScholar";

export const EASY_SCHOLAR_RANK_FIELD = "easyScholarRank";
export const EASY_SCHOLAR_IF_FIELD = "easyScholarIF";
export const EASY_SCHOLAR_IF5_FIELD = "easyScholarIF5";
export const EASY_SCHOLAR_PUBLICATION_FIELD = "easyScholarPublication";
export const EASY_SCHOLAR_UPDATED_AT_FIELD = "easyScholarUpdatedAt";

export type PublicationQueryOutcome = "saved" | "cached" | "skipped" | "failed";

export interface PublicationRankChip {
  text: string;
  className: string;
}

export function getPublicationRankChipClass(value: string): string {
  const text = value.trim();
  const sci = text.match(/\bSCI\s+Q([1-4])\b/i);
  if (sci) return `sci-q${sci[1]}`;
  const cas = text.match(/中科院[^|]*?([1-4])区/);
  if (cas) return `cas-${cas[1]}`;
  if (/^IF\s+/i.test(text)) return "if";
  return "rank-other";
}

function getCompactCasRank(rank: string): string {
  const match = rank.match(/中科院[^|]*?([1-4])区/);
  return match ? `中科院${match[1]}区` : "";
}

export function formatCompactPublicationRank(
  rank: string,
  impactFactor: string,
): PublicationRankChip[] {
  const chips: PublicationRankChip[] = [];
  const cas = getCompactCasRank(rank);
  const sci = rank.match(/\bSCI\s+Q([1-4])\b/i);
  if (cas)
    chips.push({ text: cas, className: getPublicationRankChipClass(cas) });
  if (sci) chips.push({ text: `SCI Q${sci[1]}`, className: `sci-q${sci[1]}` });
  const impact = impactFactor.trim();
  if (impact) chips.push({ text: `IF ${impact}`, className: "if" });
  return chips;
}

export interface PublicationItem {
  id: number;
  parentID?: number | null | false;
  isRegularItem?: () => boolean;
  getField: (field: string) => unknown;
  saveTx?: () => void;
}

export interface QueryItemOptions {
  force?: boolean;
  query?: (
    publication: string,
    options?: { force?: boolean },
  ) => Promise<PublicationRankResult | undefined>;
  setExtra?: (key: string, value: string) => void;
}

export function getPublicationName(
  item: PublicationItem | false | null | undefined,
): string {
  if (!item) return "";
  const publicationTitle = String(
    item.getField("publicationTitle") ?? "",
  ).trim();
  if (publicationTitle) return publicationTitle;
  return String(item.getField("journalAbbreviation") ?? "").trim();
}

export function isEligiblePublicationItem(
  item: PublicationItem | false | null | undefined,
): item is PublicationItem {
  if (
    !item ||
    typeof item.isRegularItem !== "function" ||
    !item.isRegularItem()
  ) {
    return false;
  }
  if (
    item.parentID !== undefined &&
    item.parentID !== null &&
    item.parentID !== false &&
    item.parentID !== 0
  ) {
    return false;
  }
  return !!getPublicationName(item);
}

function defaultSetExtra(
  item: PublicationItem,
  key: string,
  value: string,
): void {
  addon.data.ztoolkit.ExtraField.setExtraField(
    item as unknown as Zotero.Item,
    key,
    value,
  );
}

export async function queryItemPublicationRank(
  item: PublicationItem | false | null | undefined,
  options: QueryItemOptions = {},
): Promise<PublicationQueryOutcome> {
  if (!isEligiblePublicationItem(item)) return "skipped";
  const publication = getPublicationName(item);
  const query = options.query || queryPublicationRank;
  const result = await query(publication, { force: options.force });
  if (!result) return "failed";

  const currentPublication = getPublicationName(item);
  if (currentPublication !== publication) return "skipped";
  const setExtra =
    options.setExtra || ((key, value) => defaultSetExtra(item, key, value));
  setExtra(EASY_SCHOLAR_RANK_FIELD, result.rank);
  setExtra(EASY_SCHOLAR_IF_FIELD, result.impactFactor);
  setExtra(EASY_SCHOLAR_IF5_FIELD, result.impactFactor5);
  setExtra(EASY_SCHOLAR_PUBLICATION_FIELD, result.publication);
  setExtra(EASY_SCHOLAR_UPDATED_AT_FIELD, result.updatedAt);
  item.saveTx?.();
  return options.force ? "saved" : "saved";
}

export async function queryItemsPublicationRank(
  items: Array<PublicationItem | false>,
  options: QueryItemOptions = {},
): Promise<{
  total: number;
  saved: number;
  cached: number;
  skipped: number;
  failed: number;
}> {
  const counts = {
    total: items.length,
    saved: 0,
    cached: 0,
    skipped: 0,
    failed: 0,
  };
  for (const item of items) {
    const result = await queryItemPublicationRank(item, options);
    counts[result] += 1;
  }
  return counts;
}

const pendingPublicationLookups = new Map<
  number,
  ReturnType<typeof setTimeout>
>();

export function scheduleItemPublicationRank(itemID: number): void {
  if (pendingPublicationLookups.has(itemID)) return;
  let attempts = 0;
  const run = async () => {
    pendingPublicationLookups.delete(itemID);
    const item = Zotero.Items.get(itemID) as PublicationItem | false;
    if (isEligiblePublicationItem(item)) {
      try {
        await queryItemPublicationRank(item);
      } catch (error) {
        ztoolkit.log("EasyScholar automatic item query failed", {
          type: error instanceof Error ? error.name : "unknown",
        });
      }
      return;
    }
    attempts += 1;
    const debugItem = item as PublicationItem | false;
    if (attempts < 4 && debugItem && debugItem.isRegularItem?.()) {
      const timer = setTimeout(() => void run(), 500 * attempts);
      pendingPublicationLookups.set(itemID, timer);
    }
  };
  const timer = setTimeout(() => void run(), 300);
  pendingPublicationLookups.set(itemID, timer);
}

export function shutdownPublicationRankLookups(): void {
  for (const timer of pendingPublicationLookups.values()) clearTimeout(timer);
  pendingPublicationLookups.clear();
}
