import { getPref } from "../utils/prefs";
import { getServiceSecret, setServiceSecret } from "../utils/secret";

export const EASY_SCHOLAR_ENDPOINT =
  "https://www.easyscholar.cc/open/getPublicationRank";
export const EASY_SCHOLAR_SECRET_ID = "easyScholar";
export const EASY_SCHOLAR_CACHE_PREF = "easyScholarCache";
export const EASY_SCHOLAR_DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000;
export const EASY_SCHOLAR_REQUEST_INTERVAL = 500;

export interface PublicationRankResult {
  publication: string;
  rank: string;
  impactFactor: string;
  impactFactor5: string;
  updatedAt: string;
}

interface EasyScholarResponse {
  code?: unknown;
  data?: {
    officialRank?: {
      select?: Record<string, unknown>;
      all?: Record<string, unknown>;
    };
    customRank?: {
      rankInfo?: unknown[];
      rank?: unknown[];
    };
  } | null;
}

const OFFICIAL_LABELS: Record<string, string> = {
  sci: "SCI",
  ssci: "SSCI",
  ahci: "A&HCI",
  sciUp: "中科院升级版",
  sciBase: "中科院基础版",
  sciUpTop: "中科院升级版Top",
  sciUpSmall: "中科院升级版小类",
  jci: "JCI",
  sciif: "IF",
  sciif5: "IF5",
};

export function normalizePublicationName(publication: string): string {
  return String(publication || "").trim().replace(/\s+/gu, " ").toLowerCase();
}

function safeText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function parseOfficialRanks(
  ranks: Record<string, unknown> | undefined,
): { rankParts: string[]; impactFactor: string; impactFactor5: string } {
  const rankParts: string[] = [];
  let impactFactor = "";
  let impactFactor5 = "";
  if (!ranks || typeof ranks !== "object") {
    return { rankParts, impactFactor, impactFactor5 };
  }

  for (const [key, value] of Object.entries(ranks)) {
    const text = safeText(value);
    if (!text) continue;
    if (key === "sciif") {
      impactFactor = text;
      continue;
    }
    if (key === "sciif5") {
      impactFactor5 = text;
      continue;
    }
    const label = OFFICIAL_LABELS[key] || key;
    rankParts.push(`${label} ${text}`);
  }
  return { rankParts, impactFactor, impactFactor5 };
}

function parseCustomRanks(data: EasyScholarResponse["data"]): string[] {
  const custom = data?.customRank;
  if (!custom || !Array.isArray(custom.rankInfo) || !Array.isArray(custom.rank)) {
    return [];
  }
  const rankInfo = new Map<string, Record<string, unknown>>();
  for (const info of custom.rankInfo) {
    if (!info || typeof info !== "object") continue;
    const record = info as Record<string, unknown>;
    const uuid = safeText(record.uuid);
    if (uuid) rankInfo.set(uuid, record);
  }
  const result: string[] = [];
  for (const value of custom.rank) {
    const parts = safeText(value).split("&&&");
    if (parts.length !== 2) continue;
    const info = rankInfo.get(parts[0]);
    const level = Number(parts[1]);
    if (!info || !Number.isInteger(level) || level < 1 || level > 5) continue;
    const text = safeText(info[`${["", "one", "two", "three", "four", "five"][level]}RankText`]);
    const name = safeText(info.abbName);
    if (name && text) result.push(`${name} ${text}`);
  }
  return [...new Set(result)];
}

export function parsePublicationRankResponse(
  response: unknown,
  publication: string,
  updatedAt = new Date().toISOString(),
): PublicationRankResult | undefined {
  if (!response || typeof response !== "object") return;
  const value = response as EasyScholarResponse;
  if (value.code !== 200 || !value.data) return;
  const official = value.data.officialRank;
  const selected = official?.select;
  const all = official?.all;
  const selectedHasValues =
    !!selected && Object.values(selected).some((item) => safeText(item));
  const parsedOfficial = parseOfficialRanks(selectedHasValues ? selected : all);
  const rank = [...parsedOfficial.rankParts, ...parseCustomRanks(value.data)].join(
    " | ",
  );
  return {
    publication,
    rank,
    impactFactor: parsedOfficial.impactFactor,
    impactFactor5: parsedOfficial.impactFactor5,
    updatedAt,
  };
}

export function getEasyScholarSecret(): string {
  return getServiceSecret(EASY_SCHOLAR_SECRET_ID);
}

export function setEasyScholarSecret(secret: string): void {
  setServiceSecret(EASY_SCHOLAR_SECRET_ID, secret);
}

export function clearEasyScholarSecret(): void {
  setServiceSecret(EASY_SCHOLAR_SECRET_ID, "");
}

export function getEasyScholarCacheTTL(): number {
  const configured = Number(getPref("easyScholarCacheTTL"));
  return Number.isFinite(configured) && configured > 0
    ? configured
    : EASY_SCHOLAR_DEFAULT_TTL;
}
