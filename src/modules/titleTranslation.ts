import { config } from "../../package.json";
import { addTranslateTask, type TranslateTask } from "../utils/task";
import { getPref } from "../utils/prefs";

export const TITLE_FIELD = "titleTranslation";
export const TITLE_SOURCE_HASH_FIELD = "titleTranslationSourceHash";
export const TITLE_SERVICE_FIELD = "titleTranslationService";
export const TITLE_TARGET_LANGUAGE = "zh-CN";

type TitleItem = {
  id: number;
  parentID?: number | null;
  isRegularItem?: () => boolean;
  getField: (field: string) => unknown;
  saveTx?: () => void;
};

export function normalizeLanguage(language: unknown): string {
  return String(language ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

export function isChineseLanguage(language: unknown): boolean {
  const value = normalizeLanguage(language);
  return (
    value === "中文" ||
    value === "汉语" ||
    value === "汉文" ||
    value === "chinese" ||
    value === "zh" ||
    value.startsWith("zh-") ||
    value.startsWith("chinese-")
  );
}

export function isEligibleNewTitleItem(item: TitleItem | false | null | undefined): item is TitleItem {
  if (!item || typeof item.isRegularItem !== "function" || !item.isRegularItem()) {
    return false;
  }
  if (item.parentID !== undefined && item.parentID !== null) {
    return false;
  }
  return String(item.getField("title") ?? "").trim().length > 0;
}

export function hashTitle(title: string): string {
  let hash = 2166136261;
  for (const char of title.normalize("NFKC")) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getExtra(item: TitleItem, key: string): string {
  return String(
    addon.data.ztoolkit.ExtraField.getExtraField(item as unknown as Zotero.Item, key) ?? "",
  );
}

function setExtra(item: TitleItem, key: string, value: string): void {
  addon.data.ztoolkit.ExtraField.setExtraField(item as unknown as Zotero.Item, key, value);
}

function selectedService(): string {
  return String(getPref("translateSource") || "google");
}

function titleTask(item: TitleItem, title: string, service: string, sourceHash: string): TranslateTask | undefined {
  const task = addTranslateTask(title, item.id, "title", service);
  if (!task) return;
  task.langto = TITLE_TARGET_LANGUAGE;
  task.titleSourceHash = sourceHash;
  return task;
}

async function translateOne(itemID: number): Promise<void> {
  if (!getPref("enableAutoTitleTranslation")) {
    ztoolkit.log("ZoteroSci title auto-translation disabled", itemID);
    return;
  }

  await new Promise<void>((resolve) => setTimeout(resolve, 300));
  const item = Zotero.Items.get(itemID) as TitleItem | false;
  if (!isEligibleNewTitleItem(item)) {
    ztoolkit.log("ZoteroSci skipped ineligible new item", itemID);
    return;
  }

  const title = String(item.getField("title") ?? "").trim();
  const language = item.getField("language");
  if (getPref("skipChineseTitle") && isChineseLanguage(language)) {
    ztoolkit.log("ZoteroSci skipped Chinese-language title", itemID, language);
    return;
  }

  const existing = getExtra(item, TITLE_FIELD);
  const sourceHash = hashTitle(title);
  if (existing && !getPref("overwriteTitleTranslation")) {
    ztoolkit.log("ZoteroSci skipped existing Chinese title", itemID);
    return;
  }
  if (existing && getExtra(item, TITLE_SOURCE_HASH_FIELD) === sourceHash) {
    ztoolkit.log("ZoteroSci skipped unchanged title", itemID);
    return;
  }

  const service = selectedService();
  ztoolkit.log("ZoteroSci starting title translation", {
    itemID,
    service,
    title: title.slice(0, 120),
  });
  const task = titleTask(item, title, service, sourceHash);
  if (!task) return;

  try {
    await addon.hooks.onTranslate(task, {
      noDisplay: true,
      noCheckZoteroItemLanguage: true,
    });
    if (task.status !== "success") {
      ztoolkit.log("ZoteroSci automatic title translation failed", task.result);
      return;
    }

    const currentItem = Zotero.Items.get(itemID) as TitleItem | false;
    if (!isEligibleNewTitleItem(currentItem)) return;
    const currentTitle = String(currentItem.getField("title") ?? "").trim();
    if (hashTitle(currentTitle) !== sourceHash) {
      ztoolkit.log("ZoteroSci skipped stale automatic title translation", itemID);
      return;
    }
    setExtra(currentItem, TITLE_SOURCE_HASH_FIELD, sourceHash);
    setExtra(currentItem, TITLE_SERVICE_FIELD, service);
    currentItem.saveTx?.();
    ztoolkit.log("ZoteroSci saved Chinese title", itemID);
  } catch (error) {
    ztoolkit.log("ZoteroSci automatic title translation error", error);
  }
}

export async function translateNewTitles(ids: number[]): Promise<void> {
  const uniqueIDs = [...new Set(ids)].filter((id) => Number.isInteger(id));
  let cursor = 0;
  const worker = async () => {
    while (cursor < uniqueIDs.length) {
      const itemID = uniqueIDs[cursor++];
      await translateOne(itemID);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(2, uniqueIDs.length) }, () => worker()),
  );
}

export function titleTranslationConfigKey(): string {
  return `${config.prefsPrefix}.enableAutoTitleTranslation`;
}
