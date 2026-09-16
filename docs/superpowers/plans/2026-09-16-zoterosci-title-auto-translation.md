# ZoteroSci 新增条目标题自动翻译 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the local prototype with the current `zotero-pdf-translate` codebase, rename it to `ZoteroSci`, and add automatic Chinese title translation for newly added regular items.

**Architecture:** Keep the reference plugin's bootstrap, service registry, preference window, task runner, Extra custom field, item pane, item-tree column, and menu. Add a focused title-auto-translation module that listens to the existing item notifier and creates reference-compatible title tasks with `langto: "zh-CN"`.

**Tech Stack:** TypeScript, Zotero 9 bootstrap API, zotero-plugin-scaffold, zotero-plugin-toolkit, Fluent, Vitest/Mocha tests, XPI build.

**Spec:** `docs/superpowers/specs/2026-09-16-zoterosci-title-auto-translation-design.md`

## Global Constraints

- Base source is the current `windingwind/zotero-pdf-translate` repository at the captured baseline commit.
- Plugin display name is exactly `ZoteroSci`.
- Only newly added regular top-level items are automatic inputs.
- Target language is fixed to `zh-CN`.
- Existing reference translation features must remain available.
- Stored title result uses the reference `titleTranslation` custom Extra field and is labeled `中文标题` in the UI.
- Automatic failures are isolated per item and never break notifier processing.

### Task 1: Import Reference Baseline and Rename Plugin

**Files:** replace the current addon source with the reference repository; modify `package.json`, `zotero-plugin.config.ts`, manifest templates and Fluent addon names.

- [ ] Copy the reference repository baseline into the implementation worktree while preserving a rollback commit.
- [ ] Set `config.addonName` to `ZoteroSci`, `config.addonRef` to `zoterosci`, and use a stable ID `zoterosci@local`.
- [ ] Update generated manifest values and addon Fluent labels.
- [ ] Run the reference typecheck/build before adding feature code.
- [ ] Commit baseline import and rename.

### Task 2: Add Title Translation Preference Definitions and UI

**Files:** `addon/prefs.js`, `addon/chrome/content/preferences.xhtml`, `src/modules/preferenceWindow.ts`, relevant Fluent files.

- [ ] Add defaults for `enableAutoTitleTranslation`, `skipChineseTitle`, and `overwriteTitleTranslation`.
- [ ] Add namespaced controls to the existing General/Service preference pane.
- [ ] Bind controls through the reference `onPrefsLoad` flow and explicit `command` handlers.
- [ ] Add Chinese and English labels and descriptions.
- [ ] Test read/write behavior with the reference preference helper.
- [ ] Commit preferences.

### Task 3: Implement Title Record and Eligibility Helpers

**Files:** `src/modules/titleTranslation.ts`, `src/modules/titleTranslation.test.ts` or repository test location.

- [ ] Define the internal record keys `titleTranslation`, `titleTranslationSourceHash`, and `titleTranslationService` in the same Extra convention as the reference plugin.
- [ ] Implement `isEligibleNewTitleItem(item)` requiring `item.isRegularItem()`, no parent item, and a non-empty title.
- [ ] Implement Chinese-language detection for `zh`, `zh-CN`, `zh-Hans`, and other configured Chinese markers.
- [ ] Implement deterministic title hashing using Web Crypto or the reference crypto helper.
- [ ] Add tests for empty titles, attachments/notes, child items, Chinese language, and hash changes.
- [ ] Commit the pure helpers.

### Task 4: Integrate Automatic New-Item Translation with Reference Services

**Files:** `src/modules/titleTranslation.ts`, `src/hooks.ts`, `src/modules/notify.ts` or the reference notifier integration.

- [ ] Register the existing `item` notifier without creating a second competing notifier.
- [ ] On `event === "add"`, re-read each item after notifier delivery and filter eligibility.
- [ ] Read the current sentence service from the reference preference system.
- [ ] Construct the reference `TranslateTask` with `type: "title"`, `raw: title`, `langto: "zh-CN"`, and the selected service.
- [ ] Run tasks asynchronously with bounded concurrency and per-item error isolation.
- [ ] Before saving, re-read the title and compare its hash to the request hash.
- [ ] Respect skip-Chinese, overwrite, and existing matching record rules.
- [ ] Save the result through `ztoolkit.ExtraField.setExtraField()` and `item.saveTx()`.
- [ ] Add tests for successful translation, duplicate suppression, overwrite behavior, title races, and isolated failures.
- [ ] Commit integration.

### Task 5: Preserve and Adapt Existing Manual Title UI

**Files:** reference title task/menu/item pane/item tree modules and Fluent labels.

- [ ] Keep the existing manual title menu and shortcut behavior.
- [ ] Ensure the displayed title field label is `中文标题` in Chinese and `Chinese Title` in English.
- [ ] Ensure automatic and manual writes use the same Extra field and record metadata.
- [ ] Ensure the list column and item pane update after automatic saves.
- [ ] Add regression tests for manual title translation and automatic result display.
- [ ] Commit UI adaptation.

### Task 6: Build, Static Checks, and Independent Profile Acceptance

**Files:** build configuration, package checks, test fixtures, acceptance checklist.

- [ ] Build the XPI from the imported reference scaffold.
- [ ] Verify manifest ID/name/version bounds, bootstrap files, chrome content, prefs, and Fluent resources.
- [ ] Run typecheck and the complete test suite.
- [ ] Install into an independent Zotero 9.0.6 profile.
- [ ] Verify startup, preference pane opening, service selection, manual translation, automatic new-item translation, skip behavior, and shutdown cleanup.
- [ ] Record the final XPI path, version, and SHA256.
- [ ] Commit final verification updates.
