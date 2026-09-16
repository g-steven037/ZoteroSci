import { config } from "../../package.json";
import { getString } from "../utils/locale";

export function registerExtraColumns() {
  // TEMP: Remove after Zotero 7.0.10
  const registerColumn =
    Zotero.ItemTreeManager.registerColumn ||
    Zotero.ItemTreeManager.registerColumns;
  registerColumn.call(Zotero.ItemTreeManager, {
      dataKey: "titleTranslation",
      label: getString("field-titleTranslation"),
      dataProvider: (item, dataKey) =>
        ztoolkit.ExtraField.getExtraField(item, "titleTranslation") || "",
      pluginID: config.addonID,
      zoteroPersist: ["width", "hidden", "sortDirection"],
    });
  registerColumn.call(Zotero.ItemTreeManager, {
      dataKey: "easyScholarRank",
      label: getString("field-easyScholarRank"),
      dataProvider: (item: Zotero.Item) =>
        ztoolkit.ExtraField.getExtraField(item, "easyScholarRank") || "",
      pluginID: config.addonID,
      zoteroPersist: ["width", "hidden", "sortDirection"],
    });
}
