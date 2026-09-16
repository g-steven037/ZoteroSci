import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { formatCompactPublicationRank, getPublicationRankChipClass } from "./easyScholarFields";

function ensureRankStyles(doc: Document): void {
  if (doc.getElementById("zoterosci-easyScholar-rank-styles")) return;
  const style = doc.createElement("style");
  style.id = "zoterosci-easyScholar-rank-styles";
  style.textContent = `
    .zoterosci-rank-chip { display: inline-block; margin: 1px 3px 1px 0; padding: 2px 6px; border-radius: 4px; white-space: nowrap; font-size: 0.9em; }
    .zoterosci-rank-chip.if { color: #3f7f46; background: #e1f0e2; }
    .zoterosci-rank-chip.sci-q1 { color: #e33225; background: #ffe1de; }
    .zoterosci-rank-chip.sci-q2 { color: #70458b; background: #eee3f4; }
    .zoterosci-rank-chip.sci-q3 { color: #3f7f46; background: #e1f0e2; }
    .zoterosci-rank-chip.sci-q4, .zoterosci-rank-chip.rank-other { color: #666; background: #ededed; }
    .zoterosci-rank-chip.cas-1 { color: #e33225; background: #ffe1de; }
    .zoterosci-rank-chip.cas-2 { color: #70458b; background: #eee3f4; }
    .zoterosci-rank-chip.cas-3 { color: #c35b12; background: #ffe8d5; }
    .zoterosci-rank-chip.cas-4 { color: #3f7f46; background: #e1f0e2; }
  `;
  doc.head?.appendChild(style);
}

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
      dataProvider: (item: Zotero.Item) => {
        const rank = ztoolkit.ExtraField.getExtraField(item, "easyScholarRank") || "";
        const impact = ztoolkit.ExtraField.getExtraField(item, "easyScholarIF") || "";
        return formatCompactPublicationRank(rank, impact)
          .map((chip) => chip.text)
          .join(" | ");
      },
      renderCell: (_index, data, _column, _isFirstColumn, doc) => {
        ensureRankStyles(doc);
        const container = doc.createElement("span");
        container.className = "zoterosci-rank-cell";
        for (const text of data.split(" | ").filter(Boolean)) {
          const chip = doc.createElement("span");
          chip.className = `zoterosci-rank-chip ${getPublicationRankChipClass(text)}`;
          chip.textContent = text;
          container.appendChild(chip);
        }
        return container;
      },
      pluginID: config.addonID,
      zoteroPersist: ["width", "hidden", "sortDirection"],
    });
}
