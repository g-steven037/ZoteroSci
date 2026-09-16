import { getPublicationRankColumnOptions } from "../src/modules/itemTree";

describe("publication rank column sizing", function () {
  it("does not impose a fixed or minimum width", function () {
    const options = getPublicationRankColumnOptions();
    assert.isUndefined(options.width);
    assert.isUndefined(options.minWidth);
    assert.isUndefined(options.flex);
  });
});
