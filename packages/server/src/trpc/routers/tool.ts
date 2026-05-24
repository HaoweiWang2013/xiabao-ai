/**
 * tool router：列出可用工具描述
 */
import { procedure, router } from '../trpc';

export const toolRouter = router({
  list: procedure.query(({ ctx }) => {
    const list = ctx.services.tool.list();
    return Promise.resolve(list);
  }),
});
