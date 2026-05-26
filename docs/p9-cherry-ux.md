# P9 · Cherry-Studio 风格 UX 重构 · 规划与 TODO

> 状态：🟢 主线（9-1 / 9-2 / 9-3 / 9-4 / 9-6）已交付；多分屏拆出到 **P9-Pro** 单独排期。
> 触发：用户回看「新建 Provider」流程时无法手动输入模型 ID，也没法自动拉模型；同时希望整体设置 / 布局向 CherryStudio 看齐（多标签 + 顶部导航 + 多分屏）。
> 范围：桌面端 + Web 端，mobile 占位（M8 跟进）。
> 目标：把模型管理流程合并、统一设置页布局、补「导航栏位置」开关；多分屏拆 P9-Pro。

## 进度面板

| Task | 名称                                                                                                       | 状态                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 9-1  | 后端：`provider.probeRemoteByCreds` 草稿态 probe + tRPC `probeModelsByCreds`                               | 🟢 已交付（service / router / 5 case 单测；server 129/129）                                |
| 9-2  | 前端：`CreateProviderDialog` stepper 化 + 抽 `ProbeModelsList` + 手动加行 + 完成时 `create` + `upsertBulk` | 🟢 已交付（抽 `model-display.tsx` / `ProbeModelsList.tsx`，ModelManager / index 同步重构） |
| 9-3  | 前端：Provider 两栏布局（左 Provider 列表 + 右详情）+ 删顶部「+ 新建 Provider」按钮 + 列表底「+ 添加」入口 | 🟢 已交付                                                                                  |
| 9-4  | 前端：`navBarPositionAtom` + `IconTopBar` + `AppShell` 切换 + `AppearanceSettings` 「导航栏设置」 Card     | 🟢 已交付                                                                                  |
| 9-5  | 多分屏 + tab 右键「在右侧打开」+ `panesAtom`                                                               | 🚧 拆 P9-Pro（独立 todolist 单独立项；本期不做）                                           |
| 9-6  | i18n `settings.appearance.navBar*` 4 key × 2 lang + 本文档进度同步                                         | 🟢 已交付                                                                                  |
| 9-7  | 全包 typecheck + server test + 手测三路径                                                                  | 🟢 typecheck 17/17 / server test 129/129；手测路径见 §3                                    |

---

## 0 · 提出的具体改动

按用户原话整理，分为 7 个独立子项：

| 序号 | 用户原话                                                                    | 现状                                                                                                                                                                                                                    | 期望                                                                                                            |
| ---- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ①    | 「这个界面无法自己输入模型 Id」（图一 · CreateProviderDialog）              | `provider-settings/index.tsx` 的 `CreateProviderDialog`（lines 242–306）只问 `name` / `kind` / `baseUrl` / `apiKey`，**完全不涉及模型** —— 创建完 Provider 必须先打开卡片，再点 ModelManager 里的「+ 添加 / 🔄 拉取」。 | 创建对话框内联模型管理：手动加模型 ID + 自动从 API 拉模型 + 多选勾选入库。                                      |
| ②    | 「系统可以根据 API 自己获取模型，将获取到的模型 Id 展示，还包括上下文长度」 | `ModelManager` 内的 `ProbeModelsDialog`（lines 503–680）已经实现「probe + 多选 + ctx 展示」，但**只在 Provider 卡片内才能触发**，新建流程触达不到。                                                                     | 把 ProbeModelsDialog 的能力嫁接进 CreateProviderDialog（共享同一组件）。                                        |
| ③    | 「用户再选择要添加的模型，使用多选框」                                      | 已经是 Checkbox 多选（lines 612–648）。                                                                                                                                                                                 | 保持多选 UX，在创建流程里复用。                                                                                 |
| ④    | 「删除图二的新建提供商按钮」                                                | `provider-settings/index.tsx` line 82–84 的右上角 `+ 新建 Provider`。                                                                                                                                                   | 删按钮，改成 CherryStudio 风格（左侧 Provider 列表底部「+ 添加」入口，参图三 525:534）。                        |
| ⑤    | 「具体模型提供商和设置界面的模块仿照图三图四」                              | 当前 `features/settings/index.tsx` 是「左 settings 分类导航 + 右内容区」两栏；`provider-settings/index.tsx` 是「卡片列表」铺平。                                                                                        | 升级为 CherryStudio「三栏」：左 settings 分类 / 中 Provider 列表（ON 开关 + 头像 + 名）/ 右当前 Provider 详情。 |
| ⑥    | 「新增顶部导航栏，支持多分屏」                                              | 现在只有左侧 `IconSidebar`（6 项垂直 icon bar），没有「左 / 顶」切换；`TabBar` 是「会话 tab」语义，没有「分屏」概念。                                                                                                   | (a) 在 Appearance 设置加「导航栏位置 = 左侧 / 顶部」切换；(b) 同时支持「多分屏」—— 同一窗口内多个会话窗格并列。 |
| ⑦    | 「将我说的这些放到文档内」                                                  | —                                                                                                                                                                                                                       | 本文档。                                                                                                        |
| 附   | 「看看其他是否全部完成」                                                    | 指代上一轮 **M4 长尾 Phase 8 OCR**。                                                                                                                                                                                    | 见本文 §6「Phase 8 OCR 自查清单」。                                                                             |

---

## 1 · 关键设计决策

### 1.1 CreateProviderDialog 内联模型管理（覆盖 ①②③）

**两段式 vs 单页式**

- ❌ 单页式（创建表单一屏塞下「Provider 信息 + 模型多选」）：宽度不够，体验差。
- ✅ **两段式 stepper**：Step 1 = 填 Provider 基础信息（kind / name / baseUrl / apiKey）；点「下一步」临时建一个未提交的 in-memory provider，然后 Step 2 = 复用 `ProbeModelsDialog` 的列表（probe + 多选）+「手动添加一行」入口；底部「完成」一并写入。

**Provider 草稿如何 probe？**

- 后端 `provider.probeModels` 现在要求 `providerId`。新增一个 `provider.probeRemoteModelsByCreds` mutation，接受 `{ kind, baseUrl, apiKey }`，不落库；前端 Step 2 直接调它。
- 防误用：rate-limit 同 endpoint 每 5s 一次；apiKey 仅在内存停留，不写日志。

**手动输入 model id**

- 复用 `ModelEditDialog` 的「modelId 失焦自动 inferCapability」流程；在 Step 2 顶部加个「+ 手动添加一行」小按钮，会把这行预填进多选列表（默认勾选）。

### 1.2 删除右上角「新建 Provider」按钮（覆盖 ④⑤）

参考图三的 CherryStudio 模型服务页布局：

```
┌── settings 主导航 ──┬── Provider 列表 ──┬── 当前 Provider 详情 ──┐
│  模型服务  *current │ 🔍 搜索框          │ 标题：DeepSeek         │
│  默认模型           │ ─────────────────  │ API 密钥 (可见性切换)  │
│  常规设置           │ DeepSeek      [ON] │ API 地址               │
│  显示设置           │ Ollama        [ON] │ ─────────────────────  │
│  数据设置           │ CherryIN      [ON] │ 模型 (DeepSeek 分组)   │
│  ...                │ ...                │   ├─ DeepSeek Chat     │
│                     │ ─────────────────  │   ├─ DeepSeek Reasoner │
│                     │ + 添加             │   └─ ...               │
│                     │                    │ [🔄 获取模型列表] [+]  │
└─────────────────────┴────────────────────┴────────────────────────┘
```

**入口迁移**：

- 右上角的 `<Button>+ 新建 Provider</Button>` 删除。
- Provider 列表底部加一个「+ 添加」行（参图三 524 位置），点击 → 复用 §1.1 的两段式 Dialog。
- 中间列宽固定 240–280px，可拖拽（**M5+ 优化项**，本期写死）。

**Provider 详情区改造**：

- 现有 `LocalEmbedderCard` / 通用模型列表 → 移到中右栏的右半部分（替换原 Card 内 body）。
- 顶部摘要换成 CherryStudio 风格：name + kind badge + ON Switch；下方两个 inline 字段（API 密钥 + API 地址，hover 显眼）。
- 「获取模型列表」按钮直接 inline 在「模型」段标题右侧（不再藏在 ModelManager 子组件里）。

### 1.3 导航栏位置开关（覆盖 ⑥a）

**位置可切**：参图四 139–179「导航栏设置 → 导航栏位置 = 左侧 / 顶部」。

- 新增 `navBarPositionAtom` ∈ `'left' | 'top'`，默认 `'left'`（保留现状）。
- `AppShell.tsx` 顶层判断 atom，渲染 `IconSidebar`（左）或 `IconTopBar`（顶）。
- `IconTopBar` 横向版：logo + 6 个 icon item 横排 + 右侧主题 / 设置图标；中栏从「左中右」退化为「上下」。
- 持久化：本地存储 + i18n key `settings.appearance.navBarPosition*`。

### 1.4 多分屏（覆盖 ⑥b）

**MVP 范围**：单窗口内**最多 2 个会话窗格**横向并列；M5+ 再扩 N 分屏 + 垂直分屏。

**State 模型升级**：

```ts
// 当前
openTabsAtom: Tab[];        // 一维 tab 列表
activeTabIdAtom: string;    // 一维 active

// 升级
panesAtom: Pane[];          // 每个 pane 自带 tabs[]
                            // Pane = { id; tabs: Tab[]; activeTabId }
activePaneIdAtom: string;
```

**操作**：

- TabBar 上每个 tab 右键菜单加「→ 在右侧打开」「← 在左侧打开」。
- 点 Tab 时只切当前 pane 的 active；不影响兄弟 pane。
- 关闭 pane 内最后一个 tab 时，pane 自动消失。

**Layout**：

- AppShell 右内容区用 CSS Grid 二分；中间留 4px gutter，可拖拽（hover 高亮）。
- 拖拽用 `react-resizable-panels` 或自写最小实现（推荐 react-resizable-panels，已在我们的 Tailwind 体系里跑过）。

---

## 2 · 任务清单（按依赖顺序）

> 每完成一个 task 就打 ✅；遇到风险新增子 task。

### 9-1 后端：草稿态 probe ⚪

- [ ] `packages/server/src/services/provider.service.ts` 新增 `probeRemoteByCreds({ kind, baseUrl, apiKey })`：内部 new 一个临时 `ChatProvider` 实例 → 调 `listModels` → 返回 `ProviderListedModel[]`，**不落库**。
- [ ] `packages/server/src/trpc/routers/provider.ts` 新增 `probeModelsByCreds` mutation；同源 5s rate-limit。
- [ ] 单测：mock provider，验证 ok / 401 / network error 三路径。

### 9-2 前端：CreateProviderDialog stepper 化 ⚪

- [ ] `provider-settings/index.tsx` 把 `CreateProviderDialog` 改造为 stepper（Step 1 / Step 2）。
- [ ] Step 2 复用 `ProbeModelsDialog` 的列表渲染逻辑：抽出 `<ProbeModelsList />` 通用组件，参数：`fetchFn`（probeByCreds vs probeById）+ `onConfirm`。
- [ ] Step 2 顶部加「+ 手动添加一行」小按钮：点击 → 内联展开输入框（modelId + 自动 inferCapability hint），写入本地 state；底部「完成」时和勾选项一起 bulk upsert。
- [ ] 完成动作：`provider.create` + `provider.upsertModelsBulk`（事务保护：create 成功才 upsert）。

### 9-3 前端：Provider 三栏布局 ⚪

- [ ] `provider-settings/index.tsx` 重排为三栏：
  - 左 = 当前 settings 分类导航（来自 `features/settings/index.tsx` 已有的 NAV）
  - 中 = Provider 列表（搜索 + ON 开关 + 头像 placeholder + 名 + 底部「+ 添加」）
  - 右 = 选中 Provider 详情（API 密钥 + API 地址 inline 编辑 + 模型分组 + 获取列表按钮）
- [ ] 删除右上角 `<Button>+ 新建 Provider</Button>`。
- [ ] 新增 `selectedProviderIdAtom`；列表点击切换；URL deep-link `?providerId=` 同步（方便从其它入口跳）。
- [ ] 把 `LocalEmbedderCard` 内嵌到右栏（保持原有 capability 探测）。

### 9-4 前端：导航栏位置开关 ⚪

- [ ] `packages/state/src/atoms.ts` 加 `navBarPositionAtom`（默认 'left'，localStorage 持久化键 `xb:navBarPosition`）。
- [ ] `layout/IconTopBar.tsx` 新建：横向 navbar，logo + 6 icon + 右侧 theme/settings 入口。
- [ ] `layout/AppShell.tsx` 根据 atom 切换：left = 原结构；top = `<IconTopBar /> + <main>...</main>`。
- [ ] `features/settings/AppearanceSettings.tsx` 加「导航栏设置」Card：`<SegBtn left|top />`。
- [ ] i18n：`settings.appearance.navBar*` zh/en 各 4 key。

### 9-5 前端：多分屏 ⚪

- [ ] `packages/state/src/atoms.ts` 新增 `panesAtom: Pane[]` + `activePaneIdAtom`；migration 从老的 `openTabsAtom` 自动包成 1 个 pane（兼容）。
- [ ] `TabBar.tsx` 右键菜单加「在右侧打开」「在左侧打开」（用 `@radix-ui/react-context-menu`）。
- [ ] `AppShell.tsx` 右内容区改 CSS Grid 二分；引入 `react-resizable-panels`（dep：`react-resizable-panels@^2`）。
- [ ] 关闭 pane 内最后一个 tab → 自动 splice pane。

### 9-6 文档 + i18n ⚪

- [ ] 本文档（`docs/p9-cherry-ux.md`）持续追加进度。
- [ ] `docs/12-ui-design.md` §4「导航栏 / 标签栏 / 多分屏」段更新（保留原 §4.2 留作 left 模式描述）。
- [ ] `docs/07-providers.md` §4.1 加「Probe by creds」mutation 说明。
- [ ] `docs/10-roadmap.md` M5 段落加 P9 子段（链回本文）。
- [ ] i18n `provider.create.step1Title` / `step2Title` / `manualAdd` / `pickModels` / `navBarPositionLeft` / `navBarPositionTop` 等 \~14 key × 2 lang。

### 9-7 验证 ⚪

- [ ] `pnpm -r --if-present typecheck` 全绿
- [ ] `pnpm --filter @xiabao/{core,server,app-ui} test` 全绿
- [ ] 手测：新建 Provider 全流程（probe / 手动加 / 多选 / 完成）/ 左右导航切换 / 双 pane 同时跑两个会话。

---

## 3 · 验收标准

1. 「+ 添加」入口在 Provider 列表底部（参图三 525），点击直接进 stepper Dialog。
2. Step 2 能调 `probeModelsByCreds`，10s 内出列表；列表每行展示 `name + id + ctx + family`，多选 → 完成。
3. 「+ 手动添加一行」能在不依赖 probe 的情况下加任意 model id（兜底 Ollama 自定义模型 / 闭源 endpoint）。
4. Appearance 设置里「导航栏位置」切「左 / 顶」实时生效，刷新后保持。
5. 多分屏：把现有 tab 右键 → 在右侧打开 → 两个会话同时显示且可独立操作。
6. 原有功能不退化：Knowledge / Chat / Tools / Settings 路径全部正常。

---

## 4 · 风险 & 应对

| 风险                                                                 | 概率 | 应对                                                                                                                            |
| -------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| 草稿态 probe 的临时 ChatProvider 实例**没法复用现有 service 注入**   | 中   | 抽 `chat-provider.factory.ts`，让 `probeRemoteByCreds` 直接 `createProvider({ kind, baseUrl, apiKey })`，不进 ProviderService。 |
| 多分屏改 atom 形态会破老 localStorage                                | 高   | 加 migration：检测旧 schema `openTabsAtom: Tab[]` → 包成 `[{ id: 'main', tabs }]`；旧字段保留一版兼容回滚。                     |
| `react-resizable-panels` 在 Electron 主进程 cold start 时有 SSR 警告 | 低   | 用 dynamic import + `ssr: false`（web 路径）；electron renderer 是纯 CSR 不受影响。                                             |
| 顶部导航 vs 左侧导航的 TabBar 位置语义差异                           | 中   | 左侧模式：TabBar 在主内容区顶；顶部模式：TabBar 紧贴在 IconTopBar 下方。两种模式的 hot-key 行为保持一致。                       |
| Provider 详情区从 Card 拆到三栏后，LocalEmbedderCard 高度撑爆        | 中   | 给详情区加 `overflow-y-auto` + max-height；LocalEmbedderCard 内部已经有 ScrollArea，重叠时 inner-scroll 优先。                  |

---

## 5 · 完成定义（DoD）

- [ ] 本文档存在 ✅（本提交）
- [ ] 9-1 \~ 9-7 全部 ✅
- [ ] 全量 typecheck 绿（17 包）+ vitest 绿（新增 case 数量待定）
- [ ] e2e + smoke：手测 stepper / 多分屏 / 导航位置切换三路径
- [ ] `docs/10-roadmap.md` M5 段落已链到本文
- [ ] `docs/12-ui-design.md` §4 更新

---

## 6 · Phase 8 OCR 自查清单（响应「看看其他是否全部完成」）

上一轮 M4 长尾 Phase 8 · 图像 OCR 实际交付情况：

### 6.1 代码

| 项                                                                                                           | 状态 |
| ------------------------------------------------------------------------------------------------------------ | ---- |
| `packages/core/src/text/index.ts` 加 `IMAGE_EXT_REGEX` / `IMAGE_MIME_REGEX` / `isImageDocument`              | ✅   |
| `looksLikeBinaryDocument` 兼容图像 MIME / 扩展名                                                             | ✅   |
| `packages/server/src/extractors/node-binary.ts` 加 `TesseractModule` 类型 + `loadTesseract` + `extractImage` | ✅   |
| `createNodeBinaryExtractor({ ocrLangs })` 默认 `eng+chi_sim`                                                 | ✅   |
| `canExtract` / `extract` 加 `isImage` 分支                                                                   | ✅   |
| `packages/server/package.json` 加 `tesseract.js@^5.1.1`                                                      | ✅   |
| `pnpm install` 成功                                                                                          | ✅   |
| `packages/app-ui/src/features/knowledge/index.tsx` `isBinaryDocByName` 加图像扩展名                          | ✅   |
| `<input accept>` 加 image MIME + 扩展名                                                                      | ✅   |
| `guessMime` 加 png/jpeg/webp/gif/bmp/tiff                                                                    | ✅   |
| `knowledge.importFileDesc` zh-CN + en-US 同步加 OCR 提示                                                     | ✅   |

### 6.2 测试

| 项                                                                                                                             | 状态 |
| ------------------------------------------------------------------------------------------------------------------------------ | ---- |
| core `text.test.ts` 加 4 case（PDF/DOCX/PPTX/XLSX × mime+ext / 图像 × mime+ext / svg+plain 排除 / `isImageDocument` 独立行为） | ✅   |
| server e2e `knowledge-binary.e2e.test.ts` 加 3 case（image/png 路由 / .jpg 仅扩展名 / OCR 抽错降级）                           | ✅   |
| `pnpm --filter @xiabao/core test` → **109/109**                                                                                | ✅   |
| `pnpm --filter @xiabao/server test` → **124/124**                                                                              | ✅   |
| `pnpm -r --if-present typecheck` → **17/17**                                                                                   | ✅   |

### 6.3 文档

| 项                                                                                       | 状态 |
| ---------------------------------------------------------------------------------------- | ---- |
| `docs/14-m4-long-tail.md` §0 进度面板加 Phase 8 行                                       | ✅   |
| `docs/14-m4-long-tail.md` 插入新 §8 Phase 8 章节（设计 / 任务 / 接口契约 / 边界 / 验收） | ✅   |
| `docs/14-m4-long-tail.md` 原 §8 Final 改 §9 Final                                        | ✅   |
| `docs/14-m4-long-tail.md` 附录 A 加 OCR 源码导航                                         | ✅   |
| `docs/14-m4-long-tail.md` 附录 B 加 tesseract.js 选型决策                                | ✅   |
| `docs/13-knowledge-base.md` M4 长尾表加 Phase 8 行                                       | ✅   |
| `docs/13-knowledge-base.md` 加 §10.10 图像 OCR 章节                                      | ✅   |
| `docs/13-knowledge-base.md` 解析覆盖表升 PPTX / XLSX / 图像 OCR 为已交付                 | ✅   |
| `docs/10-roadmap.md` Phase 7 段后插入 Phase 8 段                                         | ✅   |
| `docs/10-roadmap.md` 原「图像 OCR（PaddleOCR.js 或云 API）」勾选并链接到 §8              | ✅   |

### 6.4 残留 / 后续可选

- ⚪ 单独的 `docs/p8-image-ocr.md` 用户指南（对标 `p5pro-local-embedder.md`）—— 本期没建，因为内容已经全部进 14 / 13 / 10。如果觉得有必要，可作为本期 9-6 子任务一起做。
- ⚪ OCR worker pool（per-call 创建有 \~2s cold start，频繁导入图像时可上池）。
- ⚪ langPath 离线打包（首次联网下载 \~30MB，未来若要"完全离线"可预拉 traineddata 进 desktop bundle）。
- ⚪ 扫描版 PDF 内嵌图像 OCR（pdfjs 取空 textContent 时降级到 page→PNG→tesseract 链路）。
- ⚪ `local-ocr` provider kind（类似 `local-embedder`，让用户挑高精度 PaddleOCR）。

**结论**：Phase 8 OCR 主线全部交付，剩余项为可选优化，不阻塞 M5 推进。

---

## 附录 A · 用户原始截图对照

| 截图 | 内容                                            | 本文涉及节             |
| ---- | ----------------------------------------------- | ---------------------- |
| 图一 | 现有「新建 Provider」对话框（无模型字段）       | §1.1 / §1.2 / 任务 9-2 |
| 图二 | 现有 Provider 设置页顶部「+ 新建 Provider」按钮 | §1.2 / 任务 9-3        |
| 图三 | CherryStudio「模型服务」三栏布局                | §1.2 / 任务 9-3        |
| 图四 | CherryStudio「显示设置」含「导航栏位置」开关    | §1.3 / 任务 9-4        |
