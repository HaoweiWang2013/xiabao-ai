# Changesets

此目录存放未发布的 changeset 草稿。

## 用法

```bash
pnpm changeset
```

按提示选择改动的包、变更类型（major / minor / patch）、写一句变更说明。
`.changeset/*.md` 会被自动创建，提交到仓库。

## 发版

CI 合并 main 后自动开 Release PR（由 changesets action 负责）。

## 规则

- 所有 `packages/*` 在 `config.json` 的 `fixed` 组中 → 版本统一推进
- `apps/*` 被忽略（由各自 release workflow 单独打版）
