# EasyScholar 期刊分区查询设计

## 背景与目标

ZoteroSci 当前能够在新增普通文献时自动翻译标题。本功能增加 EasyScholar 期刊等级查询，用于显示期刊分区、影响因子和五年影响因子，并与 Zotero 条目列表、右侧信息面板和右键菜单集成。

本功能只处理普通文献条目，不处理附件、笔记、注释或其他非文献条目。EasyScholar 接口为免登录开放接口，但请求必须携带用户自己的 `SecretKey`。

## 用户可见行为

### 列表与信息面板

Zotero 条目列表增加一列“期刊分区”，显示格式化后的官方等级和自定义等级，例如：

```text
SCI Q1 | 中科院 1区 | DUFE B | IF 8.2
```

右侧信息面板增加以下信息行：

- 期刊分区
- 影响因子
- 五年影响因子
- EasyScholar 数据更新时间

无查询结果时显示空值，不显示错误堆栈。查询失败不会影响条目保存、标题翻译或 Zotero 主界面。

### 查询触发

支持以下方式：

1. 开启设置后，新增普通文献时自动查询。
2. 选中一个或多个普通文献后，通过右键菜单“查询期刊分区”查询，允许使用缓存。
3. 通过右键菜单“强制刷新期刊分区”查询，忽略已有缓存，但仍遵守接口限速。

新增条目刚创建时如果尚未写入 `publicationTitle` 和 `journalAbbreviation`，查询任务应延迟并重新读取条目；如果经过有限次数重试仍没有期刊名，则安全跳过。

### 设置

设置页面新增 EasyScholar 区域：

- 新增条目时自动查询期刊分区：默认开启。
- SecretKey 输入框：密码样式或脱敏显示。
- 测试连接按钮。
- 清除密钥按钮。
- 缓存有效期：默认 7 天。

用户关闭自动查询后，手动查询仍可使用。SecretKey 不写入日志、不写入条目 Extra、不打包进 XPI。

## API 与数据模型

### 请求

```text
GET https://www.easyscholar.cc/open/getPublicationRank
```

请求参数：

- `secretKey`：用户配置的 SecretKey。
- `publicationName`：经过 `encodeURIComponent()` 编码的期刊名。

请求使用 Zotero 的 HTTP API，并设置超时和有限重试。所有请求通过统一队列发出，实际速率不超过每秒 2 次。

### 响应解析

只有 `code === 200` 且 `data` 存在时视为成功。官方等级优先读取 `data.officialRank.select`，当其为空时回退到 `data.officialRank.all`。

重点字段映射如下：

| EasyScholar 字段 | 展示内容 |
| --- | --- |
| `sci` | SCI 分区 |
| `ssci` | SSCI 分区 |
| `sciif` | 影响因子 |
| `sciif5` | 五年影响因子 |
| `sciUp` | 中科院升级版分区 |
| `sciBase` | 中科院基础版分区 |
| `jci` | JCI 指数 |
| 其他字段 | 按接口返回的缩写展示 |

自定义等级解析 `customRank.rank` 中的 `uuid&&&rank`：先按 `&&&` 拆分 UUID 和等级数字，再从 `rankInfo` 中查找 UUID，并读取对应的 `oneRankText` 至 `fiveRankText`。最终格式为“数据集缩写 等级”，例如 `DUFE B`。

不信任外部响应中的类型和字段，解析器必须对缺失数组、非字符串值、非法等级和重复值进行容错。

### 条目字段

成功查询后，将最终展示值写入条目 Extra：

- `easyScholarRank`：格式化的期刊分区和等级。
- `easyScholarIF`：`officialRank` 中的 `sciif`。
- `easyScholarIF5`：`officialRank` 中的 `sciif5`。
- `easyScholarPublication`：实际查询使用的期刊名。
- `easyScholarUpdatedAt`：ISO 时间或本地可读时间戳。

Extra 字段用于列表列和右侧信息面板的同步读取。原始完整响应只进入插件 Preference 缓存，不写入条目。

## 缓存与限速

缓存键为标准化期刊名：去除首尾空白、合并连续空白并转为小写。缓存值至少包含标准化期刊名、解析后的展示数据、查询时间和成功状态。

- 默认 TTL 为 7 天。
- 自动查询和普通手动查询命中未过期缓存，不发网络请求。
- 强制刷新跳过缓存读取，但更新缓存。
- 查询队列单线程串行执行。
- 相邻请求间隔至少 500 毫秒，满足每秒最多 2 次。
- 同一期刊的并发请求合并为一个 Promise，避免批量条目重复请求。
- 缓存损坏时丢弃该缓存并重新查询。

## 组件设计

### `src/modules/easyScholar.ts`

负责 API 请求、SecretKey 读取、响应解析、缓存、队列、TTL 和公开查询接口。建议提供以下接口：

```ts
interface PublicationRankResult {
  publication: string;
  rank: string;
  impactFactor: string;
  impactFactor5: string;
  updatedAt: string;
}

queryPublicationRank(
  publication: string,
  options?: { force?: boolean },
): Promise<PublicationRankResult | undefined>
```

该模块不得直接操作设置页面或列表 UI。

### `src/modules/easyScholarFields.ts`

负责从条目获取期刊名、判断普通文献、写入/读取 EasyScholar Extra 字段，并提供条目级查询入口。查询成功后使用 `saveTx()` 保存，失败只记录脱敏错误。

### 通知集成

在现有 Zotero item notifier 中监听新增普通文献。自动查询开关开启时，提交延迟查询任务；任务只使用 `publicationTitle` 或 `journalAbbreviation`，不处理附件通知。标题自动翻译流程与期刊查询流程相互独立，任何一个流程失败都不能阻塞另一个流程。

### 列表列

扩展现有 `registerExtraColumns()`，注册 dataKey 为 `easyScholarRank` 的列，数据提供器只读取条目 Extra，不在列表刷新期间发起网络请求。查询完成后通过 Zotero 条目修改通知刷新显示。

### 右侧信息面板

扩展现有 `registerItemPaneInfoRows()`，注册四个只读或受插件控制的信息行。展示器读取对应 Extra；用户不应直接编辑 API 生成的结果，因此默认设置为只读。强制刷新后由条目保存触发刷新。

### 右键菜单

扩展现有 `registerMenu()`：

- 普通查询菜单对选中的普通文献可见。
- 强制刷新菜单对选中的普通文献可见。
- 没有 SecretKey 时执行前提示用户配置。
- 批量查询使用共享队列，并通过已有 ProgressWindow 或进度反馈报告完成数、跳过数和失败数。

## 安全与错误处理

- SecretKey 使用 ZoteroSci 现有 Secret 存储机制，存储键为独立的 `easyScholar`。
- 日志中只记录 HTTP 状态、返回 code、期刊名的截断/哈希标识和错误类型，不记录 SecretKey、完整 URL 或完整响应。
- `publicationName` 必须使用 URL 编码。
- API 返回非 200 code、网络超时、JSON 无法解析、字段异常都转化为可处理的失败结果。
- 自动查询失败不弹出打断用户操作的对话框；手动查询失败通过进度反馈显示简短原因。
- 组件在插件关闭时清理 notifier、计时器、队列等待和 UI 注册资源。

## 测试与验收标准

### 单元测试

- 官方等级优先选择 `select`，为空时回退 `all`。
- 正确解析 `sci`、`ssci`、`sciif`、`sciif5` 和其他返回字段。
- 正确解析自定义等级 UUID 和 1 至 5 级文本。
- 非法响应、缺失字段和重复字段不会抛出未捕获异常。
- 期刊名标准化后能命中同一缓存。
- TTL 过期会重新查询，未过期缓存不会查询。
- 队列相邻请求间隔不少于 500 毫秒，并合并同一期刊的并发请求。

### Zotero 集成验收

- 新增有 `publicationTitle` 的英文普通文献后自动写入等级和 IF。
- 新增后延迟出现期刊名时仍能查询。
- 附件、笔记、注释不会触发期刊查询。
- 右键普通查询和强制刷新均可工作。
- 列表列和右侧信息面板显示与 Extra 一致。
- 设置页可保存、脱敏显示、测试和清除 SecretKey。
- 无 SecretKey 或接口失败时 ZoteroSci 仍可正常翻译标题。
- `pnpm exec tsc --noEmit`、`pnpm run build` 和 XPI 静态检查通过。

