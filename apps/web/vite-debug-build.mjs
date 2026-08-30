// 抓 vite build 的完整错误堆栈
import { build } from 'vite';

try {
  await build({
    logLevel: 'info',
    build: { sourcemap: true },
  });
  console.log('BUILD_OK');
} catch (e) {
  console.error('BUILD_FAILED');
  console.error('name:', e?.name);
  console.error('message:', e?.message);
  console.error('stack:', e?.stack);
  // rollup 错误对象常带 id/frame/loc
  if (e?.id) console.error('id:', e.id);
  if (e?.frame) console.error('frame:\n', e.frame);
  if (e?.loc) console.error('loc:', JSON.stringify(e.loc));
  if (e?.plugin) console.error('plugin:', e.plugin);
  if (e?.hook) console.error('hook:', e.hook);
  process.exit(1);
}
