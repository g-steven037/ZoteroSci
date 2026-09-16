import { clearPref, getPref, setPref } from "../utils/prefs";
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

interface CacheEntry {
  result: PublicationRankResult;
  cachedAt: number;
}

type EasyScholarHttpRequest = (url: string) => Promise<unknown>;

let httpRequest: EasyScholarHttpRequest = async (url) => {
  const response = await Zotero.HTTP.request("GET", url, {
    responseType: "json",
    timeout: 10000,
  });
  return response.response;
};
let requestChain = Promise.resolve();
let lastRequestAt = 0;
const inFlight = new Map<string, Promise<PublicationRankResult | undefined>>();

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

function readCache(): Record<string, CacheEntry> {
  try {
    const value = JSON.parse(String(getPref(EASY_SCHOLAR_CACHE_PREF) || "{}"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>): void {
  setPref(EASY_SCHOLAR_CACHE_PREF, JSON.stringify(cache));
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = requestChain.then(async () => {
    const wait = Math.max(
      0,
      EASY_SCHOLAR_REQUEST_INTERVAL - (Date.now() - lastRequestAt),
    );
    if (wait > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, wait));
    }
    lastRequestAt = Date.now();
    return task();
  });
  requestChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function requestPublicationRank(
  publication: string,
): Promise<PublicationRankResult | undefined> {
  const secret = getEasyScholarSecret();
  if (!secret) {
    ztoolkit.log("EasyScholar query skipped: SecretKey is not configured");
    return;
  }
  const url = `${EASY_SCHOLAR_ENDPOINT}?secretKey=${encodeURIComponent(
    secret,
  )}&publicationName=${encodeURIComponent(publication)}`;
  try {
    const response = await enqueue(() => httpRequest(url));
    return parsePublicationRankResponse(response, publication);
  } catch (error) {
    ztoolkit.log("EasyScholar query failed", {
      type: error instanceof Error ? error.name : "unknown",
    });
    return;
  }
}

export function queryPublicationRank(
  publication: string,
  options: { force?: boolean } = {},
): Promise<PublicationRankResult | undefined> {
  const normalized = normalizePublicationName(publication);
  if (!normalized) return Promise.resolve(undefined);
  const cache = readCache();
  const cached = cache[normalized];
  if (
    !options.force &&
    cached &&
    Date.now() - cached.cachedAt < getEasyScholarCacheTTL()
  ) {
    return Promise.resolve(cached.result);
  }
  if (inFlight.has(normalized)) return inFlight.get(normalized)!;

  const request = requestPublicationRank(publication).then((result) => {
    if (result) {
      const updated = readCache();
      updated[normalized] = { result, cachedAt: Date.now() };
      writeCache(updated);
    }
    return result;
  });
  inFlight.set(normalized, request);
  void request.finally(() => inFlight.delete(normalized));
  return request;
}

export async function testEasyScholarSecret(
  secret: string,
  publication = "Nature",
): Promise<boolean> {
  const trimmed = secret.trim();
  if (!trimmed) return false;
  const url = `${EASY_SCHOLAR_ENDPOINT}?secretKey=${encodeURIComponent(
    trimmed,
  )}&publicationName=${encodeURIComponent(publication)}`;
  try {
    const response = await enqueue(() => httpRequest(url));
    return !!parsePublicationRankResponse(response, publication);
  } catch {
    return false;
  }
}

export function clearEasyScholarCache(): void {
  clearPref(EASY_SCHOLAR_CACHE_PREF);
}

export function setEasyScholarHttpRequestForTest(
  request: EasyScholarHttpRequest,
): void {
  httpRequest = request;
}

export function shutdownEasyScholar(): void {
  inFlight.clear();
  requestChain = Promise.resolve();
  lastRequestAt = 0;
  httpRequest = async (url) => {
    const response = await Zotero.HTTP.request("GET", url, {
      responseType: "json",
      timeout: 10000,
    });
    return response.response;
  };
}
