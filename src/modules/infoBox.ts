import { getPref } from "../utils/prefs";
import { formatCompactPublicationRank } from "./easyScholarFields";

export { registerItemPaneInfoRows };

function registerItemPaneInfoRows() {
  if (!Zotero.ItemPaneManager.registerInfoRow) {
    return;
  }

  if (getPref("showItemBoxTitleTranslation") !== false) {
    Zotero.ItemPaneManager.registerInfoRow({
      rowID: "titleTranslation",
      pluginID: addon.data.config.addonID,
      label: {
        l10nID: `${addon.data.config.addonRef}-field-titleTranslation`,
      },
      onGetData: (options) => {
        return (
          ztoolkit.ExtraField.getExtraField(options.item, "titleTranslation") ||
          ""
        );
      },
      onSetData: (options) => {
        ztoolkit.ExtraField.setExtraField(
          options.item,
          "titleTranslation",
          options.value,
        );
      },
      position: "start",
      editable: true,
    });
  }

  if (getPref("showItemBoxAbstractTranslation") !== false) {
    Zotero.ItemPaneManager.registerInfoRow({
      rowID: "abstractTranslation",
      pluginID: addon.data.config.addonID,
      label: {
        l10nID: `${addon.data.config.addonRef}-field-abstractTranslation`,
      },
      onGetData: (options) => {
        return (
          ztoolkit.ExtraField.getExtraField(
            options.item,
            "abstractTranslation",
          ) || ""
        );
      },
      onSetData: (options) => {
        ztoolkit.ExtraField.setExtraField(
          options.item,
          "abstractTranslation",
          options.value,
        );
      },
      position: "afterCreators",
      editable: true,
      multiline: true,
    });
  }

  const easyScholarRows = [
    ["easyScholarRank", "field-easyScholarRank"],
    ["easyScholarIF", "field-easyScholarIF"],
    ["easyScholarIF5", "field-easyScholarIF5"],
    ["easyScholarUpdatedAt", "field-easyScholarUpdatedAt"],
  ] as const;
  for (const [rowID, l10nID] of easyScholarRows) {
    Zotero.ItemPaneManager.registerInfoRow({
      rowID,
      pluginID: addon.data.config.addonID,
      label: { l10nID: `${addon.data.config.addonRef}-${l10nID}` },
      onGetData: (options) => {
        const value =
          ztoolkit.ExtraField.getExtraField(options.item, rowID) || "";
        if (rowID === "easyScholarRank") {
          const impact =
            ztoolkit.ExtraField.getExtraField(options.item, "easyScholarIF") ||
            "";
          return formatCompactPublicationRank(value, impact)
            .filter((chip) => chip.className !== "if")
            .map((chip) => chip.text)
            .join("，");
        }
        return value;
      },
      position: "afterCreators",
      editable: false,
    });
  }
}
