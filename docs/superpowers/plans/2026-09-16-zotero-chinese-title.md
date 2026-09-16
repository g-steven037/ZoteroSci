# Zotero 中文标题插件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Zotero 9.0.6 构建可安装的 `.xpi` 插件，将普通文献条目的标题翻译为简体中文，并通过 `Extra`、信息面板和条目列表提供可编辑、可追踪的中文标题。

**Architecture:** 使用 Zotero 7/8/9 推荐的 `manifest.json` + `bootstrap.js` 生命周期，不使用 XUL Overlay 或 monkey patch。TypeScript 业务模块按翻译服务、Extra 存储、事件调度和 UI 分层，构建时将入口打包到 `addon/content/main.js`；Google Cloud Translation Basic v2 和 Azure Translator 通过统一的异步接口接入，所有网络请求只由调度器发起。

**Tech Stack:** TypeScript 5.x、esbuild、Vitest、原生 `fetch`/`AbortController`、`fflate` ZIP 打包库、Zotero 9.0.6 官方 `MenuManager`/`ItemPaneManager`/`ItemTreeManager`/Notifier API、Fluent 本地化、PowerShell XPI 打包脚本。

**Spec:** `docs/superpowers/specs/2026-09-16-zotero-chinese-title-design.md`

## Global Constraints

- 目标版本固定为 Zotero 9.0.6，`manifest.json` 的兼容上限使用 `9.0.*`。
- 仅处理 `item.isRegularItem()` 为真的条目，并要求 `title` 非空。
- 自动翻译只响应新增条目事件，不响应后续标题修改事件。
- 中文判断只依据 `language` 字段；空、未知或其他语言均继续翻译。
- 逻辑目标语言为 `zh-CN`；Google 使用 `zh-CN`，Azure 使用 `zh-Hans`。
- 翻译结果只写入 `Extra` 的插件键，不修改 Zotero SQLite、内置字段或 item type schema。
- 用户已有的 `Extra` 内容必须保留；失败请求不得覆盖已有中文标题。
- 每次任务只调用用户选择的服务，不自动切换服务。
- API Key 只保存在用户本地 Zotero preference 中，不进入源码、XPI、Extra 或日志。
- 所有用户可见文字使用 Fluent，至少提供 `en-US` 和 `zh-CN`。
- 工作区当前没有 Git 仓库；实现阶段以每个任务的测试和构建检查作为审查检查点，不执行不存在的提交命令。

---

## 文件结构与职责

实现前固定以下文件边界；新增文件按一个主要责任组织，避免 UI、网络和数据格式互相依赖：

```text
addon/
├─ manifest.json                  # Zotero 9 扩展元数据与兼容范围
├─ bootstrap.js                   # bootstrap 生命周期桥接
├─ prefs.js                       # 默认 preferences
├─ content/
│  └─ main.js                     # 构建产物，不手工编辑
└─ locale/
   ├─ en-US/chinese-title.ftl     # 英文 Fluent 文案
   └─ zh-CN/chinese-title.ftl     # 简体中文 Fluent 文案
src/
├─ index.ts                       # 插件启动、停止与依赖组装
├─ hooks.ts                       # 主窗口加载/卸载注册
├─ config.ts                      # preference key、类型和默认值
├─ translation/
│  ├─ service.ts                  # Provider、统一接口和错误类型
│  ├─ google.ts                   # Google v2 REST 适配器
│  └─ bing.ts                     # Azure Translator 适配器
├─ storage/
│  └─ chinese-title.ts            # Extra 解析、更新和记录类型
├─ events/
│  └─ notifier.ts                 # item add 监听和任务入队
├─ ui/
│  ├─ context-menu.ts             # 条目右键菜单
│  ├─ progress.ts                 # 批量翻译进度反馈
│  ├─ item-pane-row.ts            # 信息面板中文标题行
│  ├─ item-tree-column.ts         # 条目列表中文标题列
│  └─ preferences.ts              # 设置页面和测试配置
├─ utils/
│  ├─ language.ts                 # 中文语言标识归一化
│  ├─ hash.ts                     # 标题 SHA-256
│  └─ tasks.ts                    # 稳定读取、并发和取消
├─ types/
│  └─ zotero.d.ts                 # 仅覆盖本项目使用的 Zotero API 类型
└─ test/
   ├─ language.test.ts
   ├─ storage.test.ts
   ├─ hash.test.ts
   ├─ translation.test.ts
   ├─ tasks.test.ts
   ├─ notifier.test.ts
   ├─ context-menu.test.ts
   ├─ item-ui.test.ts
   ├─ preferences.test.ts
   ├─ lifecycle.test.ts
   └─ fixtures.ts
test/
└─ manual-checklist.md            # 独立 profile 手工验收清单
addon/content/preferences.xhtml    # Zotero preference pane 页面
scripts/
├─ build.mjs                      # esbuild、资源复制和 XPI 打包
└─ check-package.mjs              # XPI 内容与敏感信息检查
package.json                      # 开发、测试、构建命令
tsconfig.json                     # TypeScript 检查配置
vitest.config.ts                  # 纯模块测试配置
```

## Task 1: 建立可构建的 Zotero 插件骨架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `addon/manifest.json`
- Create: `addon/bootstrap.js`
- Create: `addon/prefs.js`
- Create: `src/index.ts`
- Create: `src/hooks.ts`
- Create: `src/config.ts`
- Create: `src/types/zotero.d.ts`
- Create: `scripts/build.mjs`
- Create: `scripts/check-package.mjs`
- Create: `test/manual-checklist.md`

**Interfaces:**
- Produces `startPlugin()`, `stopPlugin()`, `loadMainWindow(window)`, `unloadMainWindow(window)` 生命周期接口。
- Produces `PLUGIN_ID = "zotero-science-chinese-title@local"`、`PREF_PREFIX = "extensions.zotero.zoterosciencetitle."` 和 typed preference 读取函数。
- Produces `npm test`、`npm run typecheck`、`npm run build`、`npm run package:check` 命令。

- [ ] **Step 1: 写失败的骨架测试**

  在 `src/index.ts` 导出生命周期函数，在 `src/test/fixtures.ts` 中建立假的 Zotero 全局，并在 `src/test/tasks.test.ts` 中先断言 `startPlugin()` 能在 `Zotero.initializationPromise` 完成后只初始化一次。

- [ ] **Step 2: 运行测试确认失败**

  Run: `npm test -- --run src/test/tasks.test.ts`

  Expected: FAIL，因为 `package.json`、入口模块和生命周期实现尚不存在。

- [ ] **Step 3: 创建最小工程和 manifest**

  `package.json` 固定脚本和依赖：`esbuild` 用于生产构建，`typescript` 用于类型检查，`vitest` 用于单元测试。`addon/manifest.json` 使用稳定 ID、版本号 `0.1.0`、`strict_min_version: "9.0"`、`strict_max_version: "9.0.*"`，并声明 `bootstrap.js` 与 `prefs.js`。

  `src/config.ts` 定义：

  ```ts
  export type Provider = "google" | "bing";
  export interface PluginSettings {
    provider: Provider;
    googleApiKey: string;
    bingApiKey: string;
    bingEndpoint: string;
    bingRegion: string;
    skipChinese: boolean;
    overwriteExisting: boolean;
    autoTranslateOnAdd: boolean;
  }
  export const PLUGIN_ID = "zotero-science-chinese-title@local";
  export const PREF_PREFIX = "extensions.zotero.zoterosciencetitle.";
  export const DEFAULT_SETTINGS: Readonly<PluginSettings> = {
    provider: "google",
    googleApiKey: "",
    bingApiKey: "",
    bingEndpoint: "https://api.cognitive.microsofttranslator.com",
    bingRegion: "",
    skipChinese: true,
    overwriteExisting: false,
    autoTranslateOnAdd: false,
  };
  ```

  将同样的默认值落到 `addon/prefs.js`：provider 为 `google`，`skipChinese` 开启，`autoTranslateOnAdd` 和 `overwriteExisting` 关闭，Google Key、Bing Key、Bing Region 为空，Bing Endpoint 为 `https://api.cognitive.microsofttranslator.com`。

- [ ] **Step 4: 实现 bootstrap 和构建脚本**

  `addon/bootstrap.js` 在 `startup` 中等待 Zotero 初始化，再动态加载 `resource://zotero-chinese-title/content/main.js`；在 `onMainWindowLoad`/`onMainWindowUnload` 调用入口对应函数；`shutdown` 调用停止函数并清理引用。`scripts/build.mjs` 用 esbuild 将 `src/index.ts` 打包到临时 `addon/content/main.js`，复制 `addon` 和 locale 资源，再使用 `fflate.zipSync()` 生成 `dist/zotero-chinese-title-0.1.0.xpi`。

- [ ] **Step 5: 运行骨架验证**

  Run: `npm test -- --run src/test/tasks.test.ts`, `npm run typecheck`, `npm run build`, `npm run package:check`

  Expected: 生命周期测试 PASS，TypeScript 无错误，生成 XPI；包检查确认根目录含 `manifest.json`、`bootstrap.js`、`prefs.js` 和 `content/main.js`，且不含 API Key、绝对路径或 `node_modules`。

## Task 2: 实现语言判断、哈希和 Extra 存储

**Files:**
- Create: `src/utils/language.ts`
- Create: `src/utils/hash.ts`
- Create: `src/storage/chinese-title.ts`
- Create: `src/test/language.test.ts`
- Create: `src/test/hash.test.ts`
- Create: `src/test/storage.test.ts`
- Modify: `src/config.ts`

**Interfaces:**
- Produces `isChineseLanguage(language: string | null | undefined): boolean`。
- Produces `sha256Title(title: string): Promise<string>`，返回 `sha256:<lowercase-hex-digest>`。
- Produces `parseChineseTitle(extra: string): ChineseTitleRecord`、`upsertChineseTitle(extra: string, update: ChineseTitleUpdate): string`。
- `ChineseTitleRecord` 字段为 `title: string | null`、`provider: Provider | null`、`sourceHash: string | null`。

- [ ] **Step 1: 写语言判断失败测试**

  覆盖 `zh`、大小写变体、下划线、`zh-CN`、`zh-Hans-CN`、`zho`、`chi`、`cmn`、`zht`、`Chinese`、`中文`；同时断言 `en`、`ja`、空值、未知值为 false。

- [ ] **Step 2: 写哈希失败测试**

  断言同一标题得到相同 `sha256:` 值，不同标题得到不同值，且输出不含标题原文或 API Key。

- [ ] **Step 3: 写 Extra 解析和更新失败测试**

  使用以下输入断言解析和写回行为：

  ```text
  DOI: 10.1000/example
  中文标题: A translated title
  中文标题服务: google
  中文标题原文哈希: sha256:abc
  ```

  测试必须覆盖：空 Extra、新增键、更新键、重复插件键折叠、无末尾换行、CRLF、未知键保留、值中包含冒号、删除中文标题但保留用户行。

- [ ] **Step 4: 实现最小纯函数**

  `language.ts` 先 trim，再把 `_` 转为 `-` 并转小写；匹配规范化集合 `zh`、`zh-cn`、`zh-tw`、`zh-hk`、`zh-hans`、`zh-hant`、`zh-hans-cn`、`zh-hant-cn`、`zho`、`chi`、`cmn`、`zht`、`chinese`、`中文`。

  `chinese-title.ts` 按完整行的第一个 `:` 或 `：` 分隔键和值，只管理三条精确键；更新时删除原有同名插件行并在原有内容末尾插入一组规范化行，未知行和相对顺序保持不变。`title` 为空时不输出中文标题行，但可按调用方要求删除服务和哈希行。

- [ ] **Step 5: 运行纯模块测试**

  Run: `npm test -- --run src/test/language.test.ts src/test/hash.test.ts src/test/storage.test.ts`

  Expected: 所有语言、哈希和 Extra 用例 PASS。

## Task 3: 接入 Google 和 Bing/Azure 翻译服务

**Files:**
- Create: `src/translation/service.ts`
- Create: `src/translation/google.ts`
- Create: `src/translation/bing.ts`
- Create: `src/test/translation.test.ts`
- Modify: `src/config.ts`

**Interfaces:**
- Produces the following exact public types and function:

  ```ts
  export interface TranslationOptions {
    provider: Provider;
    googleApiKey?: string;
    bingApiKey?: string;
    bingEndpoint?: string;
    bingRegion?: string;
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
  }
  export type TranslationErrorKind =
    | "configuration" | "authentication" | "rate-limit"
    | "server" | "network" | "response";
  export class TranslationError extends Error {
    readonly kind: TranslationErrorKind;
    readonly status?: number;
  }
  export function translateTitle(
    title: string,
    options: TranslationOptions,
  ): Promise<string>;
  ```

- [ ] **Step 1: 写 Google 请求和响应失败测试**

  注入 fake fetch，断言 POST 到 `https://translation.googleapis.com/language/translate/v2`，查询参数只包含用户 Key，JSON body 为 `{ q: [title], target: "zh-CN", format: "text" }`；对 `{ data: { translations: [{ translatedText: "..." }] } }` 返回文本，并断言不会在 URL、错误信息或调试值中泄露标题以外的 Key。

- [ ] **Step 2: 写 Azure 请求和响应失败测试**

  断言 endpoint 规范化后请求路径带 `api/translate?api-version=3.0&to=zh-Hans`，请求头使用 `Ocp-Apim-Subscription-Key` 和非空 region 时的 `Ocp-Apim-Subscription-Region`，body 为 `[ { Text: title } ]`；对 `[ { translations: [{ text: "...", to: "zh-Hans" }] } ]` 返回文本。

- [ ] **Step 3: 写 HTTP 错误映射测试**

  让 fake fetch 分别返回 401、403、429、500、非 JSON、缺少翻译文本和拒绝 Promise，断言映射到上述错误 kind；429 message 说明稍后重试，401/403 message 说明检查 Key/权限，网络错误不包含请求头。

- [ ] **Step 4: 实现适配器和统一服务**

  两个适配器只发送一个标题，使用 `AbortSignal`，检查 HTTP 状态后解析 JSON，拒绝空结果。Google 固定 `target=zh-CN`；Azure 固定 `to=zh-Hans`，不允许从 UI 传入任意目标语言。`service.ts` 根据 `provider` 选择唯一适配器，缺少所选服务的必填配置时在本地返回 configuration 错误，不发起网络请求，不实现 fallback。

- [ ] **Step 5: 运行翻译服务测试**

  Run: `npm test -- --run src/test/translation.test.ts`

  Expected: 请求格式、目标语言、响应解析、错误映射、取消请求和配置拦截全部 PASS。

## Task 4: 实现稳定读取、任务队列和条目写回

**Files:**
- Create: `src/utils/tasks.ts`
- Create: `src/test/tasks.test.ts`
- Modify: `src/storage/chinese-title.ts`
- Modify: `src/translation/service.ts`
- Modify: `src/config.ts`

**Interfaces:**
- Produces the following exact public types and methods:

  ```ts
  export interface TaskItem {
    id: number;
    isRegularItem(): boolean;
    getField(field: "title" | "language" | "extra"): string;
    setField(field: "extra", value: string): void;
    saveTx(): Promise<void>;
  }
  export type TaskResult = {
    itemID: number;
    status: "translated" | "skipped" | "failed";
    message?: string;
  };
  export type BatchResult = {
    results: TaskResult[];
    translated: number;
    skipped: number;
    failed: number;
  };
  export interface TranslationTaskDependencies {
    getItem(itemID: number): TaskItem | null;
    getSettings(): PluginSettings;
    translate(title: string, options: TranslationOptions): Promise<string>;
    saveRecord(item: TaskItem, translated: string, provider: Provider,
      sourceHash: string): Promise<void>;
    isWindowAlive?(): boolean;
    concurrency?: number;
  }
  export class TranslationTaskCoordinator {
    constructor(deps: TranslationTaskDependencies);
    enqueue(itemID: number, reason: "manual" | "add"): Promise<TaskResult>;
    enqueueMany(itemIDs: number[], reason: "manual" | "add"): Promise<BatchResult>;
    cancelAll(): void;
  }
  ```

- [ ] **Step 1: 写单条任务失败测试**

  用 fake item 覆盖空标题、非 regular item、中文且 skip 开启、已有结果且 overwrite 关闭、已有结果但 sourceHash 与标题不匹配、成功翻译、请求失败、保存前标题变化八种情形，并断言对应状态与请求/保存次数。

- [ ] **Step 2: 写批量和去重失败测试**

  入队 `[1, 2, 1]`，断言同一 `itemID + sourceHash + provider` 只调用一次；item 1 失败不影响 item 2；并发上限为 2；`cancelAll()` 后未开始任务不发送请求。

- [ ] **Step 3: 写新增条目稳定读取失败测试**

  fake `getItem` 第一次返回无标题、第二次返回完整标题；断言 add 任务经过可取消延迟后重新读取，并只对第二次稳定数据发送请求。

- [ ] **Step 4: 实现调度流程**

  `enqueue()` 读取设置和条目，确认 `isRegularItem()` 与非空 title；add 原因执行一次短暂、可取消的稳定等待后重新获取。计算标题哈希，解析 Extra，按 `skipChinese` 和 `overwriteExisting` 决定跳过；调用 `translateTitle()`；返回前再次读取条目，若标题哈希变化则丢弃结果并返回 failed/obsolete，不写入过期翻译；否则用 `upsertChineseTitle()` 更新 Extra、调用 `item.setField("extra", nextExtra)`、`await item.saveTx()`。

  队列使用固定并发 2，任务键为 `${itemID}:${sourceHash}:${provider}`，维护 `AbortController` 集合；取消时 abort 所有 controller 并让尚未开始任务返回 skipped。用户手动翻译发生错误时保留已有 Extra，批量结果继续收集。

- [ ] **Step 5: 运行队列测试**

  Run: `npm test -- --run src/test/tasks.test.ts`

  Expected: 过滤、中文跳过、覆盖策略、稳定读取、竞态保护、去重、并发限制、错误隔离和取消测试 PASS。

## Task 5: 注册 item add 通知和主窗口生命周期

**Files:**
- Create: `src/events/notifier.ts`
- Create: `src/test/notifier.test.ts`
- Modify: `src/index.ts`
- Modify: `src/hooks.ts`
- Modify: `src/types/zotero.d.ts`

**Interfaces:**
- Produces `registerItemNotifier(coordinator, getSettings): () => void`。
- `notifier` 只对 `event === "add"` 入队；不注册或处理 `modify` 事件。
- `hooks.ts` 产生窗口级 disposer，重复 `loadMainWindow` 不重复注册，重复 unload 安全。

- [ ] **Step 1: 写 notifier 失败测试**

  模拟 `Zotero.Notifier.registerObserver(observer, ["item"], "zotero-science-chinese-title")`，发送 add、modify、delete 和非 item 事件；断言只有 add 事件的 item ID 进入队列，回调立即返回且不阻塞 Zotero 通知线程。

- [ ] **Step 2: 写生命周期失败测试**

  连续调用 `loadMainWindow(window)` 两次和 `unloadMainWindow(window)` 两次，断言菜单、Notifier 和 UI 注册器的注册/注销各发生一次；调用 `stopPlugin()` 后所有 observer 和任务均被清理。

- [ ] **Step 3: 实现 notifier**

  在通知回调中读取 `autoTranslateOnAdd`，关闭时直接返回；开启时调用 `void coordinator.enqueue(itemID, "add").catch(error => Zotero.debug(safeMessage(error)))`。Notifier token 使用稳定插件 ID，注销时调用对应 unregister API；日志只记录 item ID、状态和错误类别，不记录 title、Extra 或 Key。

- [ ] **Step 4: 接通 index/hooks**

  `startPlugin()` 等待 `Zotero.initializationPromise`，创建服务、存储回调和 coordinator，注册全局 notifier；`loadMainWindow()` 调用四个 UI 注册模块并保存 disposers；`unloadMainWindow()` 逆序调用 disposers；`stopPlugin()` 先取消任务，再卸载窗口和 notifier，最后释放模块引用。

- [ ] **Step 5: 运行事件测试和类型检查**

  Run: `npm test -- --run src/test/notifier.test.ts src/test/tasks.test.ts`, `npm run typecheck`

  Expected: add-only 行为、生命周期清理和类型检查 PASS。

## Task 6: 添加条目右键菜单和批量进度反馈

**Files:**
- Create: `src/ui/context-menu.ts`
- Create: `src/ui/progress.ts`
- Create: `src/test/context-menu.test.ts`
- Modify: `src/index.ts`
- Modify: `addon/locale/en-US/chinese-title.ftl`
- Modify: `addon/locale/zh-CN/chinese-title.ftl`

**Interfaces:**
- Produces `registerContextMenu(window, coordinator): () => void`。
- Produces `getSelectedRegularItemIDs(zoteroPane): number[]`。
- Produces progress callbacks `onStart(total)`, `onItem(result, completed, total)`、`onFinish(summary)`，失败条目继续处理。

- [ ] **Step 1: 写选择过滤失败测试**

  传入普通文献、附件、笔记和空标题项目，断言只返回可处理的普通文献 ID；没有可处理项目时菜单命令 disabled 或 hidden。

- [ ] **Step 2: 写批量进度失败测试**

  用两个成功、一个失败的 fake batch 断言进度为 1/3、2/3、3/3，最终摘要包含成功和失败数，且不会因一个 rejected promise 中断。

- [ ] **Step 3: 实现 Zotero.MenuManager 注册**

  使用 `Zotero.MenuManager.createMenuItem`/`registerMenu` 的官方接口注册到 `main/library/item`；命令文案为“翻译标题”和“重新翻译标题”，回调读取当前 selection 并调用 `enqueueMany(ids, "manual")`。重新翻译命令显式忽略已有结果，但仍遵守普通文献、非空标题和服务配置检查。

- [ ] **Step 4: 实现反馈和本地化**

  为批量任务使用 Zotero progress window 或官方通知机制显示总数、当前数和失败摘要；单条命令显示配置缺失、跳过和失败原因。将菜单、进度、错误、设置标签全部写入两个 Fluent 文件，Key 使用 `zotero-chinese-title-` 命名空间。

- [ ] **Step 5: 运行 UI 单测和构建**

  Run: `npm test -- --run src/test/context-menu.test.ts`, `npm run build`

  Expected: 选择过滤和进度测试 PASS，XPI 构建成功且 locale 文件进入包内。

## Task 7: 添加右侧信息面板和条目列表列

**Files:**
- Create: `src/ui/item-pane-row.ts`
- Create: `src/ui/item-tree-column.ts`
- Create: `src/test/item-ui.test.ts`
- Modify: `src/index.ts`
- Modify: `addon/locale/en-US/chinese-title.ftl`
- Modify: `addon/locale/zh-CN/chinese-title.ftl`

**Interfaces:**
- Produces `registerChineseTitleInfoRow(): () => void`，调用 `Zotero.ItemPaneManager.registerInfoRow({ rowID, label, onGetData, onSetData })`。
- Produces `registerChineseTitleColumn(): () => void`，调用 `Zotero.ItemTreeManager.registerColumn({ dataKey, label, renderCell })`。
- 两者只从当前 item 的 `Extra` 读取数据，绝不在渲染回调中调用翻译服务。

- [ ] **Step 1: 写信息面板读写失败测试**

  断言 `onGetData(item)` 返回 Extra 中的中文标题；`onSetData(item, value)` 更新中文标题、保留服务和 source hash、保留其他 Extra 行；空值删除中文标题键而不删除其他行。

- [ ] **Step 2: 写列表列失败测试**

  断言列渲染使用 `parseChineseTitle(item.getField("extra"))`，缺失值显示空字符串；翻译服务 mock 的调用次数始终为 0。

- [ ] **Step 3: 实现 ItemPaneManager 行**

  给信息行使用稳定 ID `zotero-science-chinese-title-info-row`；`onGetData` 读取 `extra`；`onSetData` 在 item 仍有效时写回并 `await saveTx()`，保存失败以安全错误提示通知用户。手动编辑不修改服务和 source hash，且不触发翻译。

- [ ] **Step 4: 实现 ItemTreeManager 列**

  给列使用稳定 `dataKey: "zoteroScienceChineseTitle"`；列值从 Extra 解析，渲染只做同步文本更新和必要的本地化 label；注销时保存并调用注册器返回的 disposer 或官方 unregister API。

- [ ] **Step 5: 运行 UI 测试**

  Run: `npm test -- --run src/test/item-ui.test.ts`, `npm run typecheck`

  Expected: 信息面板读写、列表显示、Extra 保留和无网络渲染测试 PASS。

## Task 8: 实现偏好设置页面、配置测试和 Key 脱敏

**Files:**
- Create: `addon/content/preferences.xhtml`
- Create: `src/ui/preferences.ts`
- Create: `src/test/preferences.test.ts`
- Modify: `addon/prefs.js`
- Modify: `src/config.ts`
- Modify: `addon/locale/en-US/chinese-title.ftl`
- Modify: `addon/locale/zh-CN/chinese-title.ftl`
- Modify: `src/index.ts`

**Interfaces:**
- Produces `registerPreferencePane(): () => void`。
- Produces `readSettings(): PluginSettings` 和 `writeSettings(partial: Partial<PluginSettings>): void`。
- Produces `testCurrentConfiguration(): Promise<ConfigTestResult>`，测试当前选中服务但不修改任何条目。

- [ ] **Step 1: 写 preference 读写失败测试**

  使用 fake `Zotero.Prefs` 断言所有键均在 `extensions.zotero.zoterosciencetitle.*` 命名空间下，布尔值以布尔 preference 保存，provider 只能为 `google` 或 `bing`，空 Key 不被当作有效配置。

- [ ] **Step 2: 写配置测试失败测试**

  mock 选中服务的健康测试请求，断言 Google 配置只需要 Google Key，Azure 配置需要 Key 和 Endpoint；测试按钮不写 item、不写 Extra、不改变自动翻译开关。

- [ ] **Step 3: 实现设置 pane**

  用 Fluent label 和 description 建立 Google/Bing 选择、对应 Key 输入、Azure Endpoint、Region、中文跳过、覆盖已有结果、新增自动翻译开关和测试按钮。根据 provider 动态隐藏无关字段；Key 使用 password 控件；保存由 Zotero preferences 管理。

- [ ] **Step 4: 实现安全错误显示**

  `safeMessage()` 只允许错误类别、HTTP 状态和固定提示模板；对 Key、Authorization、Subscription-Key、请求 URL 查询参数和响应 body 做脱敏。配置测试成功只显示“连接成功”，不显示响应正文。

- [ ] **Step 5: 运行设置测试**

  Run: `npm test -- --run src/test/preferences.test.ts`, `npm run typecheck`

  Expected: preference 命名空间、类型、动态表单、配置测试和脱敏测试 PASS。

## Task 9: 完成 Fluent 资源、生命周期清理和错误隔离

**Files:**
- Modify: `addon/locale/en-US/chinese-title.ftl`
- Modify: `addon/locale/zh-CN/chinese-title.ftl`
- Modify: `src/hooks.ts`
- Modify: `src/index.ts`
- Modify: `src/events/notifier.ts`
- Modify: `src/ui/context-menu.ts`
- Create: `src/test/lifecycle.test.ts`

**Interfaces:**
- All registration functions return idempotent `() => void` disposers。
- `stopPlugin()` 在 pending network、pending stable wait、重复窗口加载和重复关闭情况下均可安全调用。

- [ ] **Step 1: 写生命周期失败测试**

  启动两个主窗口、卸载并重新加载其中一个，再停止插件；断言每个窗口只有一组菜单/列/信息行，Notifier 只有一个 observer，所有 AbortController 被取消，未捕获 rejected promise 数为 0。

- [ ] **Step 2: 写资源完整性检查**

  测试读取两个 FTL 文件的 message ID 集合，断言集合一致；检查所有 UI 使用的 ID 都存在于两个语言文件。

- [ ] **Step 3: 实现幂等注册和逆序释放**

  每个 UI 模块保存自己的注册 token，重复注册先释放旧 token；窗口卸载按列、信息行、菜单、窗口监听器顺序清理。插件停止时顺序为取消任务、注销 Notifier、卸载窗口、注销 preference pane、清空模块引用。

- [ ] **Step 4: 运行完整测试**

  Run: `npm test -- --run`, `npm run typecheck`

  Expected: 全部纯模块、队列、UI、设置和生命周期测试 PASS。

## Task 10: 构建 XPI、静态安全检查和独立 profile 验收

**Files:**
- Modify: `scripts/build.mjs`
- Modify: `scripts/check-package.mjs`
- Modify: `test/manual-checklist.md`
- Create: `dist/zotero-chinese-title-0.1.0.xpi`

**Interfaces:**
- `npm run build` 生成唯一 XPI：`dist/zotero-chinese-title-0.1.0.xpi`。
- `npm run package:check` 对 XPI 解包并检查 manifest、bootstrap、locale、构建产物和敏感信息。

- [ ] **Step 1: 编写包检查失败测试**

  对临时 ZIP 和最终 XPI 分别测试：根目录文件存在、manifest ID/版本/兼容范围正确、没有 `node_modules`/源码 map/绝对路径/API Key 常量、两个 locale message 集合一致。

- [ ] **Step 2: 完成构建和检查脚本**

  构建前删除并重新创建 `build/` 和 `dist/` 这两个明确的生成目录；将 `src` 打包、复制 manifest/bootstrap/prefs/locale，压缩时使用 XPI 根目录布局；检查脚本遇到任一违规项退出码为 1，并打印具体文件名。

- [ ] **Step 3: 运行发布前自动验证**

  Run: `npm test -- --run`, `npm run typecheck`, `npm run build`, `npm run package:check`

  Expected: 全部测试 PASS，XPI 可解包，兼容范围为 `9.0.*`，包内无 Key 和开发机路径。

- [ ] **Step 4: 在 Zotero 9.0.6 独立 profile 手工验收**

  使用单独的 Zotero 9.0.6 profile 和数据目录，在 `test/manual-checklist.md` 逐项记录结果：安装/重启/禁用/启用/卸载/重新安装；设置 Google 和 Azure；手动单条与批量翻译；新增普通文献自动翻译；附件、笔记和注释不触发；中文语言跳过开关；已有结果覆盖开关；标题后改动不自动翻译；Extra 其他行保留；错误、429、无效 Key 和断网；无重复菜单或监听器。

- [ ] **Step 5: 记录发布产物**

  运行 `Get-FileHash dist/zotero-chinese-title-0.1.0.xpi -Algorithm SHA256`，把版本、Zotero 兼容范围、XPI 文件名和 SHA-256 写入 `test/manual-checklist.md` 的发布记录；不写入任何 API Key、个人路径或请求内容。

## 验收映射

| 设计要求 | 实施任务 |
| --- | --- |
| Zotero 9.0.6、XPI、生命周期 | Task 1、Task 9、Task 10 |
| Extra 三行格式与用户内容保留 | Task 2、Task 4、Task 7 |
| Google/Azure 免费优先、可配置 | Task 3、Task 8 |
| 手动翻译、右键菜单、批量进度 | Task 4、Task 6 |
| 新增条目自动翻译 | Task 4、Task 5 |
| 中文语言标识和跳过设置 | Task 2、Task 4、Task 8 |
| 覆盖策略、旧结果保护和竞态保护 | Task 2、Task 4、Task 7 |
| 信息面板、列表列 | Task 7 |
| 错误隔离、限流、取消 | Task 3、Task 4、Task 9 |
| 本地化和 Key 安全 | Task 8、Task 9、Task 10 |

## 验证命令汇总

```powershell
npm install
npm test -- --run
npm run typecheck
npm run build
npm run package:check
Get-FileHash dist/zotero-chinese-title-0.1.0.xpi -Algorithm SHA256
```
