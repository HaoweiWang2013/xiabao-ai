/**
 * 系统执行工具：run_shell + run_javascript
 */
import type { ToolImpl } from '@xiabao/core';

// ── run_shell ──────────────────────────────────────────────────────────────────

export function createRunShellTool(): ToolImpl {
  return {
    descriptor: {
      name: 'run_shell',
      description: 'Execute a shell command and return stdout/stderr. Use with caution.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
        },
        required: ['command'],
      },
    },
    async execute(args: Record<string, unknown>) {
      const workDir = args._workDir as string | undefined;
      const command = String(args.command ?? '');
      if (!command) throw new Error('run_shell: command is required');

      const cpMod = await import('node:child_process');

      // Windows cmd.exe 默认使用 OEM 代码页（中文系统为 GBK/CP936）输出，
      // 而 Node.js execFile 默认以 UTF-8 解码 → 编码不匹配导致中文乱码。
      //
      // 修复方案：使用 `cmd /u`（Unicode 输出标志）让 cmd.exe 以 UTF-16LE 输出，
      // 配合 `encoding: 'buffer'` 获取原始字节后用正确编码手动解码。
      // 这比 `chcp 65001` 更可靠——后者有诸多已知缺陷（缓冲异常、外部程序不受影响等）。
      const isWin = process.platform === 'win32';
      const shell = isWin ? 'cmd.exe' : '/bin/sh';
      const shellArgs = isWin ? ['/u', '/c', command] : ['-c', command];
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        ...(isWin
          ? { PYTHONIOENCODING: 'utf-8' }
          : { LANG: 'en_US.UTF-8', PYTHONIOENCODING: 'utf-8' }),
      };

      return new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve) => {
        const child = cpMod.spawn(shell, shellArgs, {
          cwd: workDir ?? process.cwd(),
          windowsHide: true,
          env,
        });

        const outChunks: Buffer[] = [];
        const errChunks: Buffer[] = [];
        child.stdout?.on('data', (chunk: Buffer) => outChunks.push(chunk));
        child.stderr?.on('data', (chunk: Buffer) => errChunks.push(chunk));

        // 超时保护
        const timer = setTimeout(() => {
          child.kill();
          resolve({ stdout: '', stderr: 'Command timed out (30s)', exitCode: 1 });
        }, 30000);

        child.on('close', (code) => {
          clearTimeout(timer);
          // Windows cmd /u → UTF-16LE；其他平台 → UTF-8
          const encoding = isWin ? 'utf16le' : 'utf8';
          resolve({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- Buffer extends Uint8Array, TS5.7 ArrayBuffer mismatch
            stdout: Buffer.concat(outChunks as any)
              .toString(encoding)
              .slice(0, 10000),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
            stderr: Buffer.concat(errChunks as any)
              .toString(encoding)
              .slice(0, 5000),
            exitCode: code ?? 0,
          });
        });

        child.on('error', (spawnErr) => {
          clearTimeout(timer);
          resolve({
            stdout: '',
            stderr: spawnErr.message,
            exitCode: 1,
          });
        });
      });
    },
  };
}

// ── run_javascript ─────────────────────────────────────────────────────────────

export function createRunJsTool(): ToolImpl {
  return {
    descriptor: {
      name: 'run_javascript',
      description:
        'Execute JavaScript code in a sandboxed VM context. Returns the result of the last expression. Limited to 5 seconds execution time. No access to filesystem or network.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'JavaScript code to execute' },
        },
        required: ['code'],
      },
    },
    async execute(args: Record<string, unknown>) {
      const code = String(args.code ?? '');
      if (!code) throw new Error('run_javascript: code is required');

      const vm = await import('node:vm');
      const sandbox: Record<string, unknown> = {
        console: {
          log: (...a: unknown[]) => results.push(a.map(String).join(' ')),
          error: (...a: unknown[]) => results.push('[ERROR] ' + a.map(String).join(' ')),
          warn: (...a: unknown[]) => results.push('[WARN] ' + a.map(String).join(' ')),
        },
        Math,
        JSON,
        Date,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        encodeURIComponent,
        decodeURIComponent,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Map,
        Set,
        Promise,
      };

      const results: string[] = [];
      const context = vm.createContext(sandbox);
      try {
        const script = new vm.Script(code);
        const result: unknown = script.runInContext(context, { timeout: 5000 });
        return {
          result: result !== undefined ? String(result) : undefined,
          logs: results,
        };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : String(err),
          logs: results,
        };
      }
    },
  };
}
