import {
  normalizePublicationName,
  parsePublicationRankResponse,
} from "../src/modules/easyScholar";

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
});
