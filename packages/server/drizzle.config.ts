import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit 配置
 *
 * 生成迁移：pnpm --filter @xiabao/server db:generate
 * 输出：packages/server/src/db/migrations/*.sql
 *
 * 注意：我们不用 drizzle-kit push，所有 DDL 变更走 generate → review → commit 流程。
 */
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
});
