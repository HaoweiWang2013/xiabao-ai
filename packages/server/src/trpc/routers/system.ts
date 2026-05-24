/**
 * system router：只读诊断信息
 *
 * 给"开发者面板"用，永远不暴露写操作。
 */
import { procedure, router } from '../trpc';

export const systemRouter = router({
  getDevInfo: procedure.query(({ ctx }) => ctx.services.system.getDevInfo()),
});
