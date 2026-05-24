# XiabaoAI 长期记忆

## 项目进度

> 进度追踪快照参见 `.xiabaoai/progress-snapshot.md`
> 项目进度：
>
> - [INFRA 合规] LICENSE 文件 — 2026-05-24
> - [M5 图像生成 Phase 1] Dall-E 3 + DB + Service + tRPC + UI — 2026-05-24 完成
>   - image_generations 表 + 迁移
>   - ChatProvider.image() 接口 + OpenAI 实现
>   - ImageService（异步生成 + 下载 + 流式状态）
>   - image tRPC router（generate subscription + list query）
>   - imageHistoryAtom + PrimaryNav.image
>   - ImageWorkspace + ImageGallery UI
