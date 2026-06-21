/**
 * 运行时平台能力探测
 *
 * `@xiabao/server` 会在 desktop 主进程、web fastify、mobile 本地 Node server 中运行。
 * 部分能力（如派生子进程）在移动端（nodejs-mobile / Capacitor）受 OS 沙箱限制不可用，
 * 需据此自动门控 `run_shell`、MCP stdio 等工具，避免向模型暴露注定失败的能力。
 */

export interface ServerCapabilities {
  /**
   * 是否可派生子进程（`child_process.spawn`）。
   * - desktop / web(Node) → true
   * - mobile(nodejs-mobile) → false（Android/iOS 沙箱禁止派生任意进程）
   *
   * 影响：`run_shell` 工具、MCP `stdio` 传输。
   */
  canSpawnProcess: boolean;
}

function detectCanSpawnProcess(): boolean {
  const env = typeof process !== 'undefined' && process.env ? process.env : {};

  // 显式开关：移动端本地 Node 启动时可设 XIABAO_PLATFORM=mobile 或 XIABAO_DISABLE_PROCESS_TOOLS=1
  if (env.XIABAO_DISABLE_PROCESS_TOOLS === '1') return false;
  if (env.XIABAO_PLATFORM === 'mobile') return false;

  // Android 上 nodejs-mobile 报 process.platform === 'android'，无法派生子进程。
  // iOS 上 nodejs-mobile 报 'darwin'（与 macOS 桌面无法区分），故依赖上面的显式开关。
  if (typeof process !== 'undefined' && process.platform === 'android') return false;

  return true;
}

/** 自动探测当前运行时的平台能力 */
export function detectServerCapabilities(): ServerCapabilities {
  return {
    canSpawnProcess: detectCanSpawnProcess(),
  };
}
