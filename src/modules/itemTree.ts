import { config } from "../../package.json";
import { getString } from "../utils/locale";
import {
  formatCompactPublicationRank,
  getPublicationRankChipClass,
} from "./easyScholarFields";

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
      const rank =
        ztoolkit.ExtraField.getExtraField(item, "easyScholarRank") || "";
      const impact =
        ztoolkit.ExtraField.getExtraField(item, "easyScholarIF") || "";
      return formatCompactPublicationRank(rank, impact)
        .map((chip) => chip.text)
        .join(" | ");
    },
    renderCell: (_index, data, column, _isFirstColumn, doc) => {
      const xhtml = "http://www.w3.org/1999/xhtml";
      const container = doc.createElementNS(xhtml, "span");
      container.className = `cell ${column.className} zoterosci-rank-cell`;
      for (const text of data.split(" | ").filter(Boolean)) {
        const chip = doc.createElementNS(xhtml, "span");
        chip.className = `zoterosci-rank-chip ${getPublicationRankChipClass(text)}`;
        chip.textContent = text;
        chip.style.display = "inline-block";
        chip.style.margin = "1px 3px 1px 0";
        chip.style.padding = "2px 6px";
        chip.style.borderRadius = "4px";
        chip.style.whiteSpace = "nowrap";
        const className = getPublicationRankChipClass(text);
        const colors: Record<string, [string, string]> = {
          if: ["#3f7f46", "#e1f0e2"],
          "sci-q1": ["#e33225", "#ffe1de"],
          "sci-q2": ["#70458b", "#eee3f4"],
          "sci-q3": ["#3f7f46", "#e1f0e2"],
          "sci-q4": ["#666666", "#ededed"],
          "cas-1": ["#e33225", "#ffe1de"],
          "cas-2": ["#70458b", "#eee3f4"],
          "cas-3": ["#c35b12", "#ffe8d5"],
          "cas-4": ["#3f7f46", "#e1f0e2"],
          "rank-other": ["#666666", "#ededed"],
        };
        const [color, background] = colors[className] || colors["rank-other"];
        chip.style.color = color;
        chip.style.backgroundColor = background;
        container.appendChild(chip);
      }
      return container;
    },
    pluginID: config.addonID,
    flex: 0,
    width: "220",
    minWidth: 180,
    zoteroPersist: ["width", "hidden", "sortDirection"],
  });
}
