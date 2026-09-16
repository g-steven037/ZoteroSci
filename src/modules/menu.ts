import { config } from "../../package.json";
import { getPref } from "../utils/prefs";
import {
  addTranslateAbstractTask,
  addTranslateTitleTask,
  TranslateTask,
} from "../utils/task";
import { getEasyScholarSecret } from "./easyScholar";
import { queryItemsPublicationRank as queryRankItems } from "./easyScholarFields";

async function querySelectedPublicationRanks(items: Zotero.Item[], force = false) {
  if (!getEasyScholarSecret()) {
    new ztoolkit.ProgressWindow("ZoteroSci")
      .createLine({ text: "Please configure the EasyScholar SecretKey in Preferences." })
      .show();
    return;
  }
  const counts = await queryRankItems(items as any, { force });
  new ztoolkit.ProgressWindow("ZoteroSci")
    .createLine({
      text: `EasyScholar: ${counts.saved} saved, ${counts.skipped} skipped, ${counts.failed} failed.`,
      progress: 100,
    })
    .show();
}

export function registerMenu() {
  const menuIcon = `chrome://${config.addonRef}/content/icons/favicon.png`;

  Zotero.MenuManager.registerMenu({
    menuID: `${config.addonRef}-translate-title`,
    pluginID: config.addonID,
    target: "main/library/item",
    menus: [
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-itemmenu-translateTitle`,
        icon: menuIcon,
        onCommand: (event, context) => {
          if (!context.items?.length) {
            return;
          }
          addon.hooks.onTranslateInBatch(
            context.items
              .map((item) => addTranslateTitleTask(item.id, true))
              .filter((task) => task) as TranslateTask[],
            { noDisplay: true, noCache: true },
          );
        },
        onShowing: (event, context) => {
          context.setVisible(
            !!(
              getPref("showItemMenuTitleTranslation") &&
              context.items?.every((item) => item.isRegularItem())
            ),
          );
        },
      },
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-itemmenu-translateAbstract`,
        icon: menuIcon,
        onCommand: (event, context) => {
          if (!context.items?.length) {
            return;
          }
          addon.hooks.onTranslateInBatch(
            context.items
              .map((item) => addTranslateAbstractTask(item.id, true))
              .filter((task) => task) as TranslateTask[],
            { noDisplay: true, noCache: true },
          );
        },
        onShowing: (event, context) => {
          context.setVisible(
            !!(
              getPref("showItemMenuAbstractTranslation") &&
              context.items?.every((item) => item.isRegularItem())
            ),
          );
        },
      },
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-itemmenu-queryPublicationRank`,
        icon: menuIcon,
        onCommand: (_event, context) => {
          if (context.items?.length) {
            void querySelectedPublicationRanks(context.items as Zotero.Item[]);
          }
        },
        onShowing: (_event, context) => {
          context.setVisible(
            !!context.items?.length &&
              context.items.every((item) => item.isRegularItem()),
          );
        },
      },
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-itemmenu-refreshPublicationRank`,
        icon: menuIcon,
        onCommand: (_event, context) => {
          if (context.items?.length) {
            void querySelectedPublicationRanks(
              context.items as Zotero.Item[],
              true,
            );
          }
        },
        onShowing: (_event, context) => {
          context.setVisible(
            !!context.items?.length &&
              context.items.every((item) => item.isRegularItem()),
          );
        },
      },
    ],
  });
}
