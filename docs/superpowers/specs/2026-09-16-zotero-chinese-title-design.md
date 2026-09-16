# Zotero 中文标题插件设计

日期：2026-09-16

状态：设计已获批准，待实现

## 1. 目标

为 Zotero 9.0.6 开发一个以 `.xpi` 发布的插件，为普通文献条目的英文或其他非中文标题生成简体中文标题。

插件支持 Google Cloud Translation 和 Bing Translator（Azure Translator）两种服务。用户可以在设置页面选择服务并填写自己的 API 配置。插件同时支持手动翻译和新增条目后的自动翻译。

## 2. 范围

### 2.1 包含

- 读取普通文献条目的 `title` 字段。
- 将翻译结果保存到 `Extra` 字段中的插件管理记录。
- 在右侧条目信息面板显示“中文标题”。
- 在中间条目列表增加“中文标题”列。
- 在条目右键菜单提供手动翻译入口。
- 监听新增条目事件并按设置自动翻译。
- 支持 Google 和 Bing 两种可切换的翻译服务。
- 提供中文跳过、覆盖已有翻译和自动翻译开关。
- 生成可安装的 `.xpi` 文件。

### 2.2 不包含

- 不修改 Zotero 的内置数据模式、SQLite 表结构或 item type schema。
- 不处理附件、笔记、注释、集合、saved search 或 feed 条目。
- 不在标题被修改后自动重新翻译。
- 不在翻译失败时自动切换到另一个翻译服务。
- 不在插件中内置公共 API Key。
- 第一版不翻译摘要、全文、笔记或 PDF 内容。

## 3. 已确认行为

### 3.1 条目范围

仅处理 `item.isRegularItem()` 为真的条目，并要求 `title` 非空。新增条目可能在第一次通知时仍处于数据写入过程，因此任务调度器必须在条目信息稳定后重新读取条目，再开始翻译。

### 3.2 手动触发

在主窗口条目列表的右键菜单中提供：

- 翻译标题
- 重新翻译标题

命令对当前选中的普通文献条目生效。非普通文献、空标题或没有有效翻译配置的条目不应发起请求。

批量翻译需要显示进度，并允许单个条目失败后继续处理其余条目。

### 3.3 自动触发

自动翻译只响应新增条目事件，不响应后续标题修改事件。任务流程如下：

1. 接收 Zotero item `add` 通知。
2. 过滤非普通文献条目。
3. 等待条目数据稳定并重新获取条目。
4. 检查标题是否为空。
5. 根据 `language` 字段判断是否跳过中文。
6. 检查已有插件记录和原文哈希，避免重复请求。
7. 调用当前选中的服务。
8. 成功后写回 `Extra` 并刷新界面。

自动翻译默认关闭，避免用户在未配置额度控制时产生意外请求。

### 3.4 中文判断

中文判断只依据条目的 `language` 字段，不通过标题内容猜测。以下标识归一化后视为中文：

```text
zh
zh-CN
zh-TW
zh-HK
zh-Hans
zh-Hant
zh-Hans-CN
zh-Hant-CN
zho
chi
cmn
zht
Chinese
中文
```

比较时忽略大小写，并将下划线视为连字符。`language` 为空、未识别或为其他语言时，不跳过翻译。

### 3.5 翻译结果

逻辑目标语言固定为简体中文 `zh-CN`。Google 适配器使用 `zh-CN`，Bing/Azure 适配器固定使用 `zh-Hans`。这类映射只存在于服务适配器中，用户界面始终显示 `zh-CN`。

## 4. 数据设计

### 4.1 Extra 存储格式

插件在 `Extra` 中维护以下键值行：

```text
中文标题: <translated title>
中文标题服务: google | bing
中文标题原文哈希: sha256:<digest>
```

插件只能更新自己识别的键，必须保留用户在 `Extra` 中已有的其他内容。读取和写入应处理缺失键、重复键、末尾换行和旧记录，避免每次保存都产生重复行。

原文哈希用于判断翻译是否对应当前标题。哈希不包含 API Key、完整请求内容以外的隐私信息，也不应输出到调试日志。

### 4.2 设置存储

设置使用插件命名空间保存到 Zotero preferences，例如：

```text
extensions.zotero.zoterosciencetitle.provider
extensions.zotero.zoterosciencetitle.googleApiKey
extensions.zotero.zoterosciencetitle.bingApiKey
extensions.zotero.zoterosciencetitle.bingEndpoint
extensions.zotero.zoterosciencetitle.bingRegion
extensions.zotero.zoterosciencetitle.skipChinese
extensions.zotero.zoterosciencetitle.overwriteExisting
extensions.zotero.zoterosciencetitle.autoTranslateOnAdd
```

API Key 只保存在用户本地配置中，不提交到仓库、不打包进 XPI、不写入 `Extra`，日志中必须脱敏。

## 5. 翻译服务设计

### 5.1 统一接口

翻译逻辑通过统一服务接口隔离提供商差异：

```text
translateTitle(title, options) -> Promise<string>
```

调度器只依赖统一接口，不直接依赖 Google 或 Azure 的请求格式。

### 5.2 Google

第一版接入 Google Cloud Translation Basic v2 REST API，使用用户提供的 API Key。请求只发送标题文本，目标语言为 `zh-CN`，默认让服务自动检测源语言。

### 5.3 Bing/Azure

第一版接入 Azure Translator 文本翻译 REST API，使用用户提供的 Key、Endpoint 和可选 Region。请求只发送标题文本，目标语言映射为 Azure 支持的简体中文代码。

### 5.4 选择和失败策略

- 用户在设置中选择一个服务。
- 每次任务只调用当前选中的服务。
- 服务请求失败时不自动切换到另一个服务。
- 对 401/403、429、网络错误和 5xx 返回用户可理解的错误信息。
- 失败时不得覆盖已有的中文标题。
- 批量任务中单条失败不应终止整个队列。

Google 和 Azure 的免费额度由服务商账户控制，插件不承诺无限免费，也不自动承担超额费用。插件可以在后续版本增加本地字符统计，但第一版不实现额度预测或计费控制。

## 6. 界面设计

### 6.1 设置页面

设置页面通过 Zotero 的 preference pane 注册机制加入 Zotero 设置。页面包含：

- 翻译服务选择：Google / Bing
- Google API Key
- Bing API Key
- Bing Endpoint
- Bing Region
- 翻译中文条目：跳过 / 不跳过
- 已有中文标题：保留 / 覆盖
- 新增条目自动翻译：开启 / 关闭
- 测试当前配置按钮

所有文本使用 Fluent 本地化，至少提供 `en-US` 和 `zh-CN`。

### 6.2 右键菜单

使用 `Zotero.MenuManager` 注册到 `main/library/item`。菜单显示逻辑必须根据当前选择过滤普通文献条目，并在没有可处理条目时隐藏或禁用命令。

### 6.3 信息面板

使用 `Zotero.ItemPaneManager.registerInfoRow()` 注册“中文标题”信息行。

- `onGetData` 从 `Extra` 解析中文标题。
- `onSetData` 允许用户手动修正中文标题并安全写回 `Extra`。
- 保存用户修改时保留服务和原文哈希；若用户手动修改结果，后续自动流程不应无条件覆盖。

### 6.4 条目列表

使用 `Zotero.ItemTreeManager.registerColumn()` 注册“中文标题”列。列数据从当前 item 的 `Extra` 解析，不在渲染过程中发起网络请求。

## 7. 生命周期和模块划分

建议目录：

```text
addon/
├─ manifest.json
├─ bootstrap.js
├─ prefs.js
├─ content/
└─ locale/
   ├─ en-US/
   └─ zh-CN/
src/
├─ index.ts
├─ hooks.ts
├─ translation/
│  ├─ service.ts
│  ├─ google.ts
│  └─ bing.ts
├─ storage/
│  └─ chinese-title.ts
├─ events/
│  └─ notifier.ts
├─ ui/
│  ├─ context-menu.ts
│  ├─ item-pane-row.ts
│  ├─ item-tree-column.ts
│  └─ preferences.ts
└─ utils/
   ├─ language.ts
   ├─ hash.ts
   └─ tasks.ts
test/
```

生命周期要求：

- `startup` 等待 Zotero 完成初始化后加载插件入口。
- `onMainWindowLoad` 注册窗口相关 UI 和窗口监听。
- `onMainWindowUnload` 清理窗口引用、定时器和窗口级监听。
- `shutdown` 注销菜单、列、信息行、Notifier、Preference pane 和未完成任务。
- 不使用旧式 XUL Overlay，不直接 monkey patch Zotero 内部实现。

## 8. 任务调度和一致性

任务调度器负责：

- 去重：以 item ID、标题哈希和服务作为任务键。
- 限制并发：批量翻译使用有限并发，避免触发服务限流。
- 稳定读取：新增通知后延迟读取条目，确保标题已写入。
- 结果一致性：请求完成后再次读取条目；若标题已经变化，则不写入过期翻译。
- 取消：插件关闭或窗口关闭时取消尚未完成的 UI 任务。
- 错误隔离：单条失败记录状态并继续处理其他条目。

## 9. 测试方案

### 9.1 单元测试

- `language` 标识归一化和中文判断。
- `Extra` 键值解析、更新、删除和保留未知内容。
- 标题哈希生成和任务去重。
- Google/Azure 响应解析。
- HTTP 错误映射。

### 9.2 集成测试

- 单条目手动翻译。
- 多条目批量翻译。
- 新增普通文献自动翻译。
- 新增附件、笔记和注释不触发翻译。
- 中文 language 条目按设置跳过或翻译。
- 已有结果按覆盖设置处理。
- 标题变化后不自动翻译。
- Google/Bing 切换。
- API Key 无效、额度不足、429、网络断开。
- Extra 中已有用户内容时不丢失内容。
- 插件禁用、启用、卸载和重启后无重复菜单或监听器。

### 9.3 手工验证

使用独立的 Zotero 开发 profile 和数据目录，验证 Zotero 9.0.6 中的安装、重启、禁用、启用、卸载和 XPI 重新安装流程。

## 10. 构建和发布

插件使用 `manifest.json`，兼容范围初始设置为 Zotero `9.0.*`。构建产物为：

```text
zotero-chinese-title-<version>.xpi
```

发布前必须检查：

- XPI 根目录包含正确的 `manifest.json` 和 `bootstrap.js`。
- manifest 中的插件 ID 唯一且稳定。
- `strict_max_version` 与实际测试版本一致。
- 没有 API Key、个人路径或开发 profile 信息。
- `en-US` 和 `zh-CN` 本地化文件齐全。
- 更新清单中的 XPI 地址和哈希正确。

## 11. 验收标准

设计实现完成后，满足以下条件才视为第一版完成：

1. 可以在 Zotero 9.0.6 中安装 `.xpi`。
2. 可以在设置页面配置 Google 或 Bing。
3. 可以手动翻译选中的普通文献标题。
4. 新增普通文献条目时，在启用自动翻译的情况下可以自动翻译。
5. 中文条目可以按设置跳过或继续翻译。
6. 翻译结果保存于 `Extra`，且不破坏其他内容。
7. 右侧信息面板和条目列表可以显示中文标题。
8. 标题后续修改不会自动触发翻译。
9. 翻译失败不会覆盖已有结果，也不会阻塞其他条目。
10. 插件禁用、卸载和重启后没有残留 UI、重复菜单或重复监听器。

## 12. 依据

- [Zotero Plugin Development](https://www.zotero.org/support/dev/client_coding/plugin_development)
- [Zotero 7 for Developers](https://www.zotero.org/support/dev/zotero_7_for_developers)
- [Zotero 9 for Developers](https://www.zotero.org/support/dev/zotero_9_for_developers)
- [Zotero JavaScript API](https://www.zotero.org/support/dev/client_coding/javascript_api)
- [Zotero Coding Guidelines](https://www.zotero.org/support/dev/client_coding/coding_guidelines)
- [Google Cloud Translation Authentication](https://docs.cloud.google.com/translate/docs/authentication)
- [Google Cloud Translation Pricing](https://cloud.google.com/products/translate/pricing)
- [Azure Translator Authentication](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/authentication)
- [Azure Translator Pricing](https://azure.microsoft.com/en-us/pricing/details/translator/)
