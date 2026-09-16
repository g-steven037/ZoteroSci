import {
  clearEasyScholarCache,
  normalizePublicationName,
  parsePublicationRankResponse,
  queryPublicationRank,
  setEasyScholarHttpRequestForTest,
  setEasyScholarSecret,
} from "../src/modules/easyScholar";
import {
  getPublicationName,
  isEligiblePublicationItem,
  queryItemPublicationRank,
  formatCompactPublicationRank,
  getPublicationRankChipClass,
} from "../src/modules/easyScholarFields";

describe("EasyScholar publication rank parser", function () {
  it("prefers selected official ranks and parses custom ranks", function () {
    const result = parsePublicationRankResponse(
      {
        code: 200,
        msg: "SUCCESS",
        data: {
          officialRank: {
            select: { sci: "Q1", sciif: "8.2", sciif5: "9.1" },
            all: { sci: "Q2", ssci: "Q3" },
          },
          customRank: {
            rankInfo: [
              {
                uuid: "u1",
                abbName: "DUFE",
                oneRankText: "A",
                twoRankText: "B",
                threeRankText: "C",
              },
            ],
            rank: ["u1&&&2"],
          },
        },
      },
      "Journal & Reports",
    );

    assert.equal(result?.publication, "Journal & Reports");
    assert.equal(result?.rank, "SCI Q1 | DUFE B");
    assert.equal(result?.impactFactor, "8.2");
    assert.equal(result?.impactFactor5, "9.1");
  });

  it("falls back to all official ranks and tolerates malformed data", function () {
    const result = parsePublicationRankResponse(
      {
        code: 200,
        data: {
          officialRank: { select: {}, all: { ssci: "Q2" } },
          customRank: { rankInfo: [], rank: ["bad", "u&&&9"] },
        },
      },
      "Journal",
    );
    assert.equal(result?.rank, "SSCI Q2");
    assert.isUndefined(
      parsePublicationRankResponse({ code: 40002, data: null }, "Journal"),
    );
  });

  it("normalizes equivalent publication names", function () {
    assert.equal(
      normalizePublicationName("  Journal   of   Reports "),
      "journal of reports",
    );
  });

  it("coalesces concurrent queries and reuses a fresh cache", async function () {
    clearEasyScholarCache();
    setEasyScholarSecret("test-key");
    let calls = 0;
    setEasyScholarHttpRequestForTest(async () => {
      calls += 1;
      return {
        code: 200,
        data: { officialRank: { select: { sciif: "8.2" } } },
      };
    });

    const first = queryPublicationRank("Journal & Reports");
    const second = queryPublicationRank(" journal   & reports ");
    const [firstResult, secondResult] = await Promise.all([first, second]);

    assert.deepEqual(firstResult, secondResult);
    assert.equal(calls, 1);
    assert.equal(
      (await queryPublicationRank("Journal & Reports"))?.impactFactor,
      "8.2",
    );
    assert.equal(calls, 1);
  });

  it("extracts publication names and persists a successful item result", async function () {
    const extras = new Map<string, string>();
    const item = {
      id: 9,
      parentID: false,
      isRegularItem: () => true,
      getField: (field: string) =>
        field === "publicationTitle" ? "Nature" : "",
      saveTx: () => undefined,
    };
    assert.isTrue(isEligiblePublicationItem(item));
    assert.equal(getPublicationName(item), "Nature");
    await queryItemPublicationRank(item, {
      query: async () => ({
        publication: "Nature",
        rank: "SCI Q1",
        impactFactor: "42.0",
        impactFactor5: "45.0",
        updatedAt: "2026-09-16T00:00:00.000Z",
      }),
      setExtra: (key: string, value: string) => extras.set(key, value),
    });
    assert.equal(extras.get("easyScholarRank"), "SCI Q1");
    assert.equal(extras.get("easyScholarIF"), "42.0");
  });

  it("formats the compact rank in the requested order", function () {
    assert.deepEqual(
      formatCompactPublicationRank("SCI Q2 | 中科院基础版 工程技术2区", "5.8"),
      [
        { text: "中科院2区", className: "cas-2" },
        { text: "SCI Q2", className: "sci-q2" },
        { text: "IF 5.8", className: "if" },
      ],
    );
    assert.equal(getPublicationRankChipClass("SCI Q1"), "sci-q1");
    assert.equal(
      getPublicationRankChipClass("中科院基础版 工程技术2区"),
      "cas-2",
    );
  });
});
