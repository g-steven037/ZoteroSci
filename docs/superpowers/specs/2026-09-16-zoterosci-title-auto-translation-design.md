# ZoteroSci 新增条目标题自动翻译设计

## 目标

以 `windingwind/zotero-pdf-translate` 当前版本为基础，插件名称改为 `ZoteroSci`，保留其翻译服务、偏好设置、生命周期、菜单和 UI 架构，仅增加普通文献条目新增时的标题自动翻译。

## 范围

- 仅处理普通顶层文献条目；
- 仅在 Zotero `item` notifier 的 `add` 事件触发；
- 手动标题翻译继续复用参考插件已有的标题翻译菜单和任务体系；
- 自动翻译使用参考插件当前选中的句子翻译服务，目标语言固定为 `zh-CN`；
- 翻译结果写入参考插件已有的 `titleTranslation` Extra 自定义字段，中文界面标签为“中文标题”，避免重复创建字段系统；
- 保存原文哈希和服务标识，用于判断结果是否对应当前标题；
- 中文条目跳过、覆盖已有结果、启用新增自动翻译均可设置；
- 不进行全库自动迁移，不改变 PDF、批注、笔记翻译功能。

## 配置

沿用参考插件的偏好前缀，并增加：

```text
extensions.zotero.ZoteroPDFTranslate.enableAutoTitleTranslation
extensions.zotero.ZoteroPDFTranslate.skipChineseTitle
extensions.zotero.ZoteroPDFTranslate.overwriteTitleTranslation
```

服务选择复用 `translateSource`。`google`、`bing`、`microsoft` 以及参考插件支持的其他 sentence 服务均可用于标题翻译。

## 数据流

```text
item add notifier
  -> filter regular top-level item
  -> read title and language
  -> skip Chinese / empty title / existing matching result
  -> create TranslateTask(type=title, langto=zh-CN)
  -> reference TranslationServices.runTranslationTask()
  -> write titleTranslation Extra field
  -> save transaction
```

## 生命周期和错误处理

- 使用参考插件的 `install`, `uninstall`, `startup`, `shutdown` 生命周期；
- 自动翻译注册与 `registerNotify(["item"])` 同步；
- 单条翻译失败只记录日志，不中断 Zotero notifier 或其他条目任务；
- 标题在翻译期间变化时不写入旧结果；
- 关闭插件时取消等待中的自动标题任务；
- 不在 notifier 回调中阻塞 Zotero 主流程，使用异步任务队列并限制并发。

## 验收标准

- Zotero 9.0.6 可以安装和启动 XPI；
- 插件在偏好设置中显示为 `ZoteroSci`；
- 参考插件原有翻译服务和设置页可正常使用；
- 新增英文普通文献条目后自动生成“中文标题”；
- 中文条目按照设置跳过或翻译；
- 非普通条目、附件、笔记、空标题不会触发翻译；
- 已有结果在覆盖关闭时保留，原文变化后可重新翻译；
- 单元测试、类型检查、XPI 构建和独立 profile 验收通过。
