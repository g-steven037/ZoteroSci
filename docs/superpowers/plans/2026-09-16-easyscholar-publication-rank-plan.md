# EasyScholar 期刊分区查询 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ZoteroSci 中接入 EasyScholar 期刊等级接口，为新增普通文献自动查询并在列表、右侧信息面板和右键菜单中显示期刊分区、IF 与五年 IF。

**Architecture:** 使用独立的 EasyScholar 服务模块负责响应解析、SecretKey、缓存、并发合并和 500ms 请求间隔；使用条目适配模块负责期刊名提取与 Extra 写入。Notifier、菜单、列表列、信息面板和设置页只调用适配模块，不直接发 HTTP 请求。

**Tech Stack:** TypeScript、Zotero 9.0.6 APIs、Zotero.HTTP、ztoolkit、Zotero ExtraField、现有 Fluent 本地化与 Preference 存储。

**Spec:** `docs/superpowers/specs/2026-09-16-easyscholar-publication-rank-design.md`

## Global Constraints

- 只处理普通文献条目，不处理附件、笔记、注释或其他非文献条目。
- API 地址固定为 `https://www.easyscholar.cc/open/getPublicationRank`，期刊名必须使用 `encodeURIComponent()` 编码。
- 请求速率不超过每秒 2 次；队列相邻请求间隔至少 500 毫秒。
- 官方等级优先使用 `officialRank.select`，为空时回退 `officialRank.all`。
- SecretKey 不写入日志、条目 Extra 或 XPI。
- 自动查询失败不得阻塞标题翻译、条目保存或 Zotero 主界面。
- 所有 UI 文本必须提供中文和英文 Fluent 文案。
- 每项任务完成后运行针对性检查并提交独立 Git commit。

---

### Task 1: 建立 EasyScholar 数据解析与展示模型

**Files:**
- Create: `src/modules/easyScholar.ts`
- Create: `test/easyScholar.test.ts`

**Interfaces:**
- Produces `PublicationRankResult`, `normalizePublicationName()`, `parsePublicationRankResponse()` and `formatPublicationRank()` for later tasks.
- `PublicationRankResult` contains `publication`, `rank`, `impactFactor`, `impactFactor5`, and `updatedAt`.

- [ ] **Step 1: Write failing parser tests**

Add a fixture containing `officialRank.select`, `officialRank.all`, two `customRank.rankInfo` entries and `customRank.rank` values. Assert that `select` wins, `sci`, `ssci`, `sciif`, and `sciif5` are retained, and `1614986460329492480&&&3` becomes `DUFE B`.

```ts
const parsed = parsePublicationRankResponse(fixture, "Journal & Reports");
assert.equal(parsed?.rank, "SCI Q1 | 中科院 1区 | DUFE B");
assert.equal(parsed?.impactFactor, "8.2");
assert.equal(parsed?.impactFactor5, "9.1");
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run `pnpm test -- easyScholar.test.ts`.

Expected: FAIL because the parser module and exported functions do not exist.

- [ ] **Step 3: Implement pure normalization and parsing**

Implement `normalizePublicationName()` with trim, whitespace collapsing and lowercase cache-key output. Implement `parsePublicationRankResponse()` with runtime object/array checks, `code === 200` validation, `select` fallback to `all`, known official field labels, duplicate removal, and safe custom rank parsing for levels 1 through 5.

- [ ] **Step 4: Add malformed-response tests and run them**

Test `undefined`, non-object responses, non-200 codes, missing rank objects, invalid custom rank strings, unknown UUIDs and rank values outside 1–5. Each case must return `undefined` or omit the malformed entry without throwing.

Run `pnpm test -- easyScholar.test.ts`.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/easyScholar.ts test/easyScholar.test.ts
git commit -m "feat: add EasyScholar response parser"
```

### Task 2: Implement SecretKey、缓存和请求限速

**Files:**
- Modify: `src/modules/easyScholar.ts`
- Modify: `src/utils/secret.ts`
- Modify: `addon/prefs.js`
- Modify: `typings/prefs.d.ts`
- Modify: `test/easyScholar.test.ts`

**Interfaces:**
- Consumes the parser from Task 1.
- Produces `queryPublicationRank(publication, options?)`, `testEasyScholarSecret(secret)`, `clearEasyScholarCache()` and `shutdownEasyScholar()`.

- [ ] **Step 1: Write failing cache and queue tests**

Stub the HTTP request function and fake the clock. Assert that two concurrent calls for the same normalized journal share one request, a fresh cache avoids a request, an expired cache requests again, and two different requests begin at least 500ms apart.

```ts
const first = queryPublicationRank("Journal & Reports");
const second = queryPublicationRank(" journal   & reports ");
assert.strictEqual(await first, await second);
assert.equal(httpCallCount, 1);
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run `pnpm test -- easyScholar.test.ts`.

Expected: FAIL because the request, cache and queue functions are not implemented.

- [ ] **Step 3: Implement isolated SecretKey storage**

Add `getEasyScholarSecret()`, `setEasyScholarSecret()` and `clearEasyScholarSecret()` using the existing secret JSON storage with the dedicated key `easyScholar`. Keep the returned value out of all logging paths.

- [ ] **Step 4: Implement Preference cache and serialized queue**

Store cache JSON under a namespaced preference with a seven-day TTL. Use a `Map<string, Promise<...>>` for in-flight request coalescing. Use a single queue worker and wait `500ms` between network requests. `force: true` bypasses cache lookup but still updates it. `shutdownEasyScholar()` rejects or clears pending work safely and removes timers.

- [ ] **Step 5: Implement HTTP request and connection test**

Build the URL with `publicationName=${encodeURIComponent(publication)}` and `secretKey=${encodeURIComponent(secret)}`. Call `Zotero.HTTP.request("GET", url, { responseType: "json", timeout: 10000 })`. Convert non-200 API codes, transport failures, invalid JSON and missing SecretKey into `undefined` or a typed test result without exposing the key.

- [ ] **Step 6: Run tests and commit**

Run `pnpm test -- easyScholar.test.ts` and `pnpm exec tsc --noEmit`.

Expected: PASS for focused tests and TypeScript.

```bash
git add src/modules/easyScholar.ts src/utils/secret.ts addon/prefs.js typings/prefs.d.ts test/easyScholar.test.ts
git commit -m "feat: add EasyScholar cache and rate-limited client"
```

### Task 3: Add item field adapter and persistence

**Files:**
- Create: `src/modules/easyScholarFields.ts`
- Modify: `test/easyScholar.test.ts`

**Interfaces:**
- Consumes `queryPublicationRank()` from Task 2.
- Produces `getPublicationName(item)`, `isEligiblePublicationItem(item)`, `queryItemPublicationRank(item, options?)`, and constants for `easyScholarRank`, `easyScholarIF`, `easyScholarIF5`, `easyScholarPublication`, and `easyScholarUpdatedAt`.

- [ ] **Step 1: Write item eligibility and persistence tests**

Use fake Zotero items to assert that journal articles and conference papers with `publicationTitle` are eligible, attachments and notes are not, `journalAbbreviation` is used as fallback, and a successful result writes all five Extra fields then calls `saveTx()` once.

- [ ] **Step 2: Run tests to verify failure**

Run `pnpm test -- easyScholar.test.ts`.

Expected: FAIL because the item adapter is not present.

- [ ] **Step 3: Implement item adapter**

Read `publicationTitle` first and `journalAbbreviation` second. Reject empty names and non-regular items. Call the service module, write only parsed display fields to Extra, set an ISO timestamp, and save the item transactionally. Return a discriminated outcome such as `{ status: "saved" | "cached" | "skipped" | "failed" }` for progress reporting.

- [ ] **Step 4: Add stale-result protection**

Capture the query publication name before the request and re-read the item before saving. If the publication name changed, do not write the old result. Add a test for this race.

- [ ] **Step 5: Run tests and commit**

Run `pnpm test -- easyScholar.test.ts` and `pnpm exec tsc --noEmit`.

```bash
git add src/modules/easyScholarFields.ts test/easyScholar.test.ts
git commit -m "feat: persist EasyScholar fields on Zotero items"
```

### Task 4: Integrate automatic lookup with item notifications

**Files:**
- Modify: `src/hooks.ts`
- Modify: `src/modules/notify.ts`
- Modify: `src/modules/easyScholarFields.ts`
- Modify: `addon/prefs.js`
- Modify: `typings/prefs.d.ts`
- Modify: `test/easyScholar.test.ts`

**Interfaces:**
- Consumes `queryItemPublicationRank()` and the EasyScholar automatic-query preference.
- Produces delayed new-item lookup with bounded metadata retries and independent error isolation from title translation.

- [ ] **Step 1: Write notifier behavior tests**

Test that an `add item` event schedules an eligible top-level item, an attachment event is ignored, a missing publication name is retried a finite number of times, and a rejected EasyScholar promise does not reject the title translation path.

- [ ] **Step 2: Run tests to verify failure**

Run `pnpm test -- easyScholar.test.ts`.

Expected: FAIL because notifier integration is not implemented.

- [ ] **Step 3: Implement delayed automatic lookup**

On `event === "add" && type === "item"`, keep the existing title translation call independent, then schedule EasyScholar lookup only when `enableAutoPublicationRank` is enabled. Re-read the item after a short delay and retry publication-name availability a bounded number of times. Use a per-item pending map to prevent duplicate add/modify work.

- [ ] **Step 4: Add lifecycle cleanup and error isolation**

Register the pending timers for shutdown cleanup. Catch EasyScholar failures at the boundary and log only safe error categories. Preserve the existing annotation and title translation behavior.

- [ ] **Step 5: Run checks and commit**

Run `pnpm test -- easyScholar.test.ts` and `pnpm exec tsc --noEmit`.

```bash
git add src/hooks.ts src/modules/notify.ts src/modules/easyScholarFields.ts addon/prefs.js typings/prefs.d.ts test/easyScholar.test.ts
git commit -m "feat: query publication rank for new items"
```

### Task 5: Add list column and right-side information rows

**Files:**
- Modify: `src/modules/itemTree.ts`
- Modify: `src/modules/infoBox.ts`
- Modify: `addon/locale/en-US/mainWindow.ftl`
- Modify: `addon/locale/zh-CN/mainWindow.ftl`
- Modify: `test/easyScholar.test.ts`

**Interfaces:**
- Consumes the five EasyScholar Extra field constants from Task 3.
- Produces a read-only list column dataKey `easyScholarRank` and four read-only item pane rows.

- [ ] **Step 1: Add display mapping tests**

Assert that a fake item containing EasyScholar Extra values returns the rank string for the list column and the expected value for each information row; missing values return an empty string.

- [ ] **Step 2: Implement the list column**

Extend `registerExtraColumns()` with a localized “期刊分区” column whose data provider reads only `easyScholarRank` from Extra. Do not perform network requests from a data provider. Preserve Zotero column width, hidden state and sort persistence.

- [ ] **Step 3: Implement information rows**

Register read-only rows for rank, IF, five-year IF and update time. Read values from Extra and use the existing item pane registration conventions.

- [ ] **Step 4: Add Fluent strings and verify**

Add English and Chinese labels for the list column and information rows. Run `pnpm exec tsc --noEmit` and the focused tests.

```bash
git add src/modules/itemTree.ts src/modules/infoBox.ts addon/locale/en-US/mainWindow.ftl addon/locale/zh-CN/mainWindow.ftl test/easyScholar.test.ts
git commit -m "feat: display EasyScholar data in item views"
```

### Task 6: Add right-click queries and batch progress

**Files:**
- Modify: `src/modules/menu.ts`
- Modify: `src/modules/easyScholarFields.ts`
- Modify: `addon/locale/en-US/mainWindow.ftl`
- Modify: `addon/locale/zh-CN/mainWindow.ftl`
- Modify: `test/easyScholar.test.ts`

**Interfaces:**
- Consumes `queryItemPublicationRank(item, options)` from Task 3.
- Produces normal and forced batch query commands with `{ total, saved, cached, skipped, failed }` progress counts.

- [ ] **Step 1: Write batch outcome tests**

Use three fake items and stub outcomes `saved`, `skipped`, and `failed`. Assert the final progress counts and that force mode is passed only to the forced command.

- [ ] **Step 2: Run tests to verify failure**

Run `pnpm test -- easyScholar.test.ts`.

Expected: FAIL because batch query commands are not implemented.

- [ ] **Step 3: Add menu entries**

Register “查询期刊分区” and “强制刷新期刊分区”. Make them visible only when every selected item is a regular item. Call the batch adapter without blocking the UI thread and use the existing ProgressWindow style for completion feedback.

- [ ] **Step 4: Handle missing SecretKey**

Before a manual query, detect an empty SecretKey and show a localized prompt directing the user to Preferences. Do not make an empty-key network request.

- [ ] **Step 5: Run checks and commit**

Run `pnpm test -- easyScholar.test.ts`, `pnpm exec tsc --noEmit` and inspect that both menu l10n IDs are present.

```bash
git add src/modules/menu.ts src/modules/easyScholarFields.ts addon/locale/en-US/mainWindow.ftl addon/locale/zh-CN/mainWindow.ftl test/easyScholar.test.ts
git commit -m "feat: add publication rank context menu"
```

### Task 7: Add Preferences UI, connection test and localization

**Files:**
- Modify: `addon/chrome/content/preferences.xhtml`
- Modify: `src/modules/preferenceWindow.ts`
- Modify: `src/modules/easyScholar.ts`
- Modify: `addon/locale/en-US/preferences.ftl`
- Modify: `addon/locale/zh-CN/preferences.ftl`
- Modify: `addon/prefs.js`
- Modify: `typings/prefs.d.ts`

**Interfaces:**
- Consumes `testEasyScholarSecret()`, `setEasyScholarSecret()`, `clearEasyScholarSecret()` and `shutdownEasyScholar()`.
- Produces persisted automatic-query and cache-TTL preferences, masked SecretKey editing and localized test/clear commands.

- [ ] **Step 1: Add preference defaults and Fluent strings**

Add defaults for `enableAutoPublicationRank` as `true` and `easyScholarCacheTTL` as `604800`. Add English and Chinese labels, descriptions, test result messages and missing-key messages.

- [ ] **Step 2: Add masked input and controls**

Add a password input for SecretKey, automatic-query checkbox, numeric cache TTL field, “测试连接” button and “清除密钥” button. Keep the actual key out of DOM text and logs; populate only the password input value when the preference pane is opened.

- [ ] **Step 3: Wire preference event handlers**

Extend `registerPrefsScripts()` and `onPrefsEvents()` with handlers that persist the key through the secret helper, validate positive TTL values, call the connection test, clear the key, and update the masked display. Use the existing stable preference-pane lifecycle pattern.

- [ ] **Step 4: Verify preferences**

Run `pnpm exec tsc --noEmit`, inspect generated IDs in the built XHTML, and verify no SecretKey literal appears in source logs or Fluent files.

```bash
git add addon/chrome/content/preferences.xhtml src/modules/preferenceWindow.ts src/modules/easyScholar.ts addon/locale/en-US/preferences.ftl addon/locale/zh-CN/preferences.ftl addon/prefs.js typings/prefs.d.ts
git commit -m "feat: add EasyScholar preferences"
```

### Task 8: Lifecycle cleanup, full verification and XPI packaging

**Files:**
- Modify: `src/hooks.ts`
- Modify: `src/modules/easyScholar.ts`
- Modify: `src/modules/notify.ts`
- Modify: `test/easyScholar.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes all preceding components.
- Produces a cleanly unloadable plugin, documented configuration, passing static checks and `dist/ZoteroSci-0.1.0.xpi`.

- [ ] **Step 1: Add shutdown tests**

Assert that calling `shutdownEasyScholar()` clears delayed timers, pending in-flight maps and queue state, and that a later query starts from a clean state.

- [ ] **Step 2: Integrate shutdown**

Call `shutdownEasyScholar()` from the plugin shutdown hook before unregistering all ztoolkit resources. Ensure notifier callback checks plugin liveness and no delayed callback accesses a destroyed addon.

- [ ] **Step 3: Update README**

Document SecretKey configuration, supported automatic/manual triggers, cache behavior, displayed fields, the 2-requests-per-second limit and the fact that EasyScholar data is stored in Extra.

- [ ] **Step 4: Run complete verification**

Run:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm run build
```

Expected: unit tests and TypeScript pass; the build creates `build/zotero-sci.xpi`.

- [ ] **Step 5: Perform XPI static inspection**

Extract or list `build/zotero-sci.xpi` and verify `manifest.json`, `bootstrap.js`, `prefs.js`, `chrome/content/preferences.xhtml`, Fluent resources and `chrome/content/scripts/zoterosci.js` are present. Verify the manifest name is `ZoteroSci`, ID is `zoterosci@local`, and strict minimum version includes Zotero 9.0.6.

- [ ] **Step 6: Copy final artifact and commit documentation**

```bash
Copy-Item -LiteralPath build/zotero-sci.xpi -Destination dist/ZoteroSci-0.1.0.xpi -Force
Get-FileHash -Algorithm SHA256 dist/ZoteroSci-0.1.0.xpi
git add src/hooks.ts src/modules/easyScholar.ts src/modules/notify.ts test/easyScholar.test.ts README.md
git commit -m "feat: complete EasyScholar publication rank integration"
```

The final report must state separately whether unit tests, TypeScript, build, static XPI inspection and live Zotero profile testing succeeded; the scaffold test suite may require a local Zotero runtime.

