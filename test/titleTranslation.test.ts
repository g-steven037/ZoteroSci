import {
  hashTitle,
  isChineseLanguage,
  isEligibleNewTitleItem,
} from "../src/modules/titleTranslation";

describe("automatic title translation eligibility", function () {
  it("recognizes Chinese language markers", function () {
    assert.isTrue(isChineseLanguage("zh-CN"));
    assert.isTrue(isChineseLanguage("中文"));
    assert.isTrue(isChineseLanguage("zh_Hans"));
    assert.isFalse(isChineseLanguage("en-US"));
  });

  it("accepts only regular top-level items with a title", function () {
    const base = {
      id: 1,
      parentID: null,
      isRegularItem: () => true,
      getField: (field: string) => field === "title" ? "A paper" : "en-US",
    };
    assert.isTrue(isEligibleNewTitleItem(base));
    assert.isTrue(isEligibleNewTitleItem({ ...base, parentID: false }));
    assert.isFalse(isEligibleNewTitleItem({ ...base, parentID: 2 }));
    assert.isFalse(isEligibleNewTitleItem({ ...base, isRegularItem: () => false }));
    assert.isFalse(isEligibleNewTitleItem({ ...base, getField: () => "" }));
  });

  it("normalizes equivalent title text before hashing", function () {
    assert.equal(hashTitle("Ａ title"), hashTitle("A title"));
    assert.notEqual(hashTitle("A title"), hashTitle("A different title"));
  });
});
