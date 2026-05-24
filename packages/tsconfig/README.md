# @xiabao/tsconfig

共享的 TypeScript 配置预设。

| 文件           | 用途                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| `library.json` | 平台无关的 TS 库（core / state / crypto / sync / testing / theme / i18n） |
| `react.json`   | React 应用 / 组件包（ui / desktop renderer / web）                        |
| `node.json`    | Node 端（desktop main / web-proxy）                                       |

## 用法

在 package 的 `tsconfig.json` 里：

```json
{
  "extends": "@xiabao/tsconfig/library.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```
