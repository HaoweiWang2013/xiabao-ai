# @xiabao/mobile

React Native（Android 优先）。**M8 才会真正实现**，当前仅占位以让 Turborepo 拓扑可见。

## 实现计划（M8）

```
apps/mobile/
├── android/
├── ios/                       # 预留（不在 M8 范围）
├── src/
│   ├── App.tsx
│   ├── storage.ts             # 入口注入 MMKV 到 @xiabao/state（详见 §3.2 策略）
│   ├── navigation/            # 底部 Tab + 抽屉
│   ├── screens/               # 按 @xiabao/ui-native/contracts 实装
│   └── adapters/              # op-sqlite / secure-store / fetch
├── metro.config.js
├── babel.config.js
├── tsconfig.json
└── package.json
```

详见 `docs/10-roadmap.md` § M8 与 `docs/p10-mobile-strategy.md`（M8 完整策略与实施清单）。

## 本期已落地的提前播种（默认该包不含运行时代码，M8 启动时可直接取用）

- `@xiabao/state` 抽象 `createPersistedAtom` + `setPersistStringStorage`，M8 入口 3 行注入 MMKV 即可走同一套持久化。
- `@xiabao/ui-native/contracts.ts` 列出 9 个 M8 屏幕的 props / 行为 / 跨端差异契约。
- `docs/p10-mobile-strategy.md` 锁定导航 / UI / 存储 / embedder / 二进制 / secret 五项决策。
