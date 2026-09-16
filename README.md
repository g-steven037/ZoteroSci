# ![ZoteroSci](addon/chrome/content/icons/favicon.png) ZoteroSci

[![Zotero 9](https://img.shields.io/badge/Zotero-9-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)

ZoteroSci 是一个面向科研文献管理的 Zotero 插件，基于开源项目 **Zotero PDF Translate** 开发。

## 原始项目

原插件已经提供 PDF、EPUB、网页、元数据、批注和笔记翻译，以及多种翻译服务支持。原插件的完整功能说明、使用文档和基础实现请访问：

- [Zotero PDF Translate 原仓库](https://github.com/windingwind/zotero-pdf-translate)


## ZoteroSci 新增功能

### 中文标题翻译

- 对普通文献条目的 `标题` 字段进行中文翻译，并保存到独立的 `中文标题` 字段。
- 支持手动翻译和自动翻译。
- 自动翻译仅在新条目加入 Zotero 时触发，不会默认扫描并翻译已有全部条目。
- 可从条目右键菜单执行翻译，也支持批量处理和进度反馈。
- 条目语言为 `zh` 或其他中文标识时，可按设置选择跳过或继续翻译。
- 翻译服务可在设置界面选择和配置，优先支持 Google 翻译、必应翻译等服务。

### EasyScholar 期刊分析

- 通过 EasyScholar 开放接口查询期刊等级、SCI 分区、中科院分区、影响因子和五年影响因子。
- 仅处理普通文献条目，并根据 `出版物` 或 `期刊缩写` 查询期刊。
- 支持新条目自动查询，以及从条目右键菜单手动查询或强制刷新。
- 查询结果显示在 `期刊分区` 列表列和条目信息面板中，以紧凑的彩色标签展示，例如：`中科院2区`、`SCI Q2`、`IF 5.8`。
- 原始数据同时保存到条目的 Extra 字段，便于检索和后续扩展。
- 请求结果缓存七天，并限制请求速率；相同期刊的并发查询会合并。

### EasyScholar 配置

在 Zotero 中打开 `编辑 → 设置 → ZoteroSci`，填写 EasyScholar `SecretKey`，使用“测试连接”确认配置。

结果字段如下：

| Extra 字段 | 说明 |
| --- | --- |
| `easyScholarRank` | 期刊等级及分区原始数据 |
| `easyScholarIF` | 影响因子 |
| `easyScholarIF5` | 五年影响因子 |
| `easyScholarPublication` | 实际查询使用的期刊名称 |
| `easyScholarUpdatedAt` | 最近一次成功查询时间 |

接口详情请参阅 [EasyScholar 期刊等级查询接口](https://www.easyscholar.cc/)。

## 安装

从 [最新稳定版](https://github.com/g-steven037/ZoteroSci/releases/latest) 下载 `.xpi` 文件，然后在 Zotero 的插件管理器中选择“从文件安装插件”。

## 开发

```bash
git clone https://github.com/g-steven037/ZoteroSci.git
cd ZoteroSci
npm install
npm run build
```

构建结果位于 `build/*.xpi`。

## 贡献

ZoteroSci 深度使用并继承了 Zotero PDF Translate 的翻译架构、服务集成和阅读器功能。感谢原作者及原仓库贡献者的长期维护，ZoteroSci 的相关工作建立在这些贡献之上。

- 改进原有 PDF、EPUB、网页、批注、笔记或通用翻译功能：请优先向 [Zotero PDF Translate 原仓库](https://github.com/windingwind/zotero-pdf-translate) 提交 Issue 或 Pull Request。
- 改进中文标题翻译、EasyScholar 期刊分析、期刊分区显示等 ZoteroSci 专属功能：请在 [ZoteroSci 仓库](https://github.com/g-steven037/ZoteroSci) 提交 Issue 或 Pull Request。
- 复用或修改原插件代码时，请保留原项目的许可证和贡献归属信息。

本项目遵循 AGPL-3.0-or-later 许可证。
