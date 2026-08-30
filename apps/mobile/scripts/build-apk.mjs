#!/usr/bin/env node
/**
 * build-apk.mjs · 跨平台 Android APK 构建入口
 *
 * 为什么存在：
 * - `cd android && gradlew assembleDebug` 只在 Windows 能跑（cmd 的 PATHEXT 会找到
 *   gradlew.bat），Linux/macOS 必须 `./gradlew`，此前 pnpm build:apk 在非 Windows 必挂
 * - gradle.properties 里的 org.gradle.java.home / local.properties 里的 sdk.dir 都是
 *   机器私有路径，不能进库；本脚本在运行时探测并注入环境变量
 *
 * 做了什么：
 * 1. 探测 JDK 17（AGP 8.2 要求）：JAVA_HOME → 常见安装位置 → PATH，注入 JAVA_HOME
 * 2. 探测 Android SDK：ANDROID_HOME/ANDROID_SDK_ROOT → 平台默认位置，
 *    并在 local.properties 缺失/失效时自动写入 sdk.dir（该文件已被 gitignore）
 * 3. npx cap sync android 同步 Web 资产
 * 4. 调 gradlew 执行构建任务（默认 assembleDebug，可用参数覆盖，如 assembleRelease）
 *
 * 用法：
 *   pnpm --filter @xiabao/mobile build:apk                # debug 包
 *   node scripts/build-apk.mjs assembleRelease            # release 包
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_DIR = path.resolve(__dirname, '..');
const ANDROID_DIR = path.join(MOBILE_DIR, 'android');
const IS_WIN = process.platform === 'win32';

const log = (...a) => console.log('[build-apk]', ...a);
const warn = (...a) => console.warn('[build-apk] ⚠', ...a);
const fail = (msg) => {
  console.error(`[build-apk] ✖ ${msg}`);
  process.exit(1);
};

/* ---------------- 1. JDK 17 探测 ---------------- */

/** 返回 java 可执行文件的 major 版本号，失败返回 null */
function javaMajor(javaBin) {
  const r = spawnSync(javaBin, ['-version'], { encoding: 'utf8', shell: false });
  const out = `${r.stderr ?? ''}${r.stdout ?? ''}`;
  const m = out.match(/version "(\d+)/);
  return m ? Number(m[1]) : null;
}

function jdkCandidates() {
  const home = os.homedir();
  const list = [];
  const push = (p) => {
    if (p && !list.includes(p)) list.push(p);
  };

  // 环境变量显式指定优先
  for (const env of [process.env.JAVA_HOME, process.env.JDK_HOME]) {
    if (env && existsSync(path.join(env, 'bin', IS_WIN ? 'java.exe' : 'java'))) push(env);
  }

  // 常见 JDK 17 安装位置（跨平台）
  if (IS_WIN) {
    push(`${home}\\local\\jdk17`);
    push('C:\\Program Files\\Eclipse Adoptium\\jdk-17');
    push('C:\\Program Files\\Java\\jdk-17');
  } else {
    push(path.join(home, 'local', 'jdk17'));
    push('/usr/lib/jvm/java-17-openjdk-amd64');
    push('/opt/homebrew/opt/openjdk@17');
  }
  return list;
}

/** 扫描 ~/.jdks 下含 "17" 的 JDK 目录 */
function jdksUnder17() {
  const dir = path.join(os.homedir(), '.jdks');
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((n) => /(^|[^0-9])17([^0-9]|$)/.test(n))
      .map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

/** 探测 JDK：返回 { home } 或 null */
function resolveJdk() {
  const candidates = [...jdkCandidates(), ...jdksUnder17()];

  // 第一轮：找 major === 17
  for (const home of candidates) {
    const bin = path.join(home, 'bin', IS_WIN ? 'java.exe' : 'java');
    if (!existsSync(bin)) continue;
    if (javaMajor(bin) === 17) {
      log(`JDK 17: ${home}`);
      return { home };
    }
  }

  // 第二轮：PATH 上的 java 是否正好 17
  const which = IS_WIN ? 'where' : 'which';
  const w = spawnSync(which, ['java'], { encoding: 'utf8', shell: IS_WIN });
  if (w.status === 0 && w.stdout) {
    const bin = w.stdout.trim().split(/\r?\n/)[0];
    if (bin && javaMajor(bin) === 17) {
      // PATH 上的 java 无法直接反推 JAVA_HOME，但 Gradle 可用 PATH 上的 java 启动
      log(`JDK 17（PATH）: ${bin}`);
      return { home: null, pathJava: bin };
    }
  }

  // 第三轮：环境变量指向的 JDK 非 17 → 警告并继续（让 Gradle 报更准确的错）
  for (const env of [process.env.JAVA_HOME, process.env.JDK_HOME]) {
    if (env && existsSync(env)) {
      warn(`JAVA_HOME=${env} 不是 JDK 17（AGP 8.2 要求 17），构建可能失败`);
      log(`仍使用 JAVA_HOME: ${env}`);
      return { home: env };
    }
  }
  return null;
}

/* ---------------- 2. Android SDK 探测 ---------------- */

function sdkCandidates() {
  const home = os.homedir();
  const list = [];
  const push = (p) => {
    if (p && !list.includes(p)) list.push(p);
  };
  push(process.env.ANDROID_HOME);
  push(process.env.ANDROID_SDK_ROOT);
  if (IS_WIN) push(path.join(home, 'AppData', 'Local', 'Android', 'Sdk'));
  else if (process.platform === 'darwin') push(path.join(home, 'Library', 'Android', 'sdk'));
  else push(path.join(home, 'Android', 'Sdk'));
  return list.filter(Boolean);
}

function looksLikeSdk(dir) {
  return (
    existsSync(dir) &&
    (existsSync(path.join(dir, 'platforms')) || existsSync(path.join(dir, 'platform-tools')))
  );
}

/** local.properties 已有有效 sdk.dir 时优先，其次探测 */
function resolveSdk() {
  const lp = path.join(ANDROID_DIR, 'local.properties');
  if (existsSync(lp)) {
    const m = readFileSync(lp, 'utf8').match(/^sdk\.dir\s*=\s*(.+)$/m);
    if (m) {
      const dir = m[1].trim().replace(/\\:/g, ':').replace(/\\\\/g, '\\');
      if (looksLikeSdk(dir)) {
        log(`Android SDK（local.properties）: ${dir}`);
        return { dir, fromLocalProps: true };
      }
      warn(`local.properties 的 sdk.dir 指向不存在的目录：${dir}，将重新探测`);
    }
  }
  for (const dir of sdkCandidates()) {
    if (looksLikeSdk(dir)) {
      log(`Android SDK: ${dir}`);
      return { dir, fromLocalProps: false };
    }
  }
  return null;
}

/** 确保 local.properties 有正确的 sdk.dir（保留文件中其余行） */
function ensureLocalProperties(sdkDir) {
  const lp = path.join(ANDROID_DIR, 'local.properties');
  const line = `sdk.dir=${sdkDir.replace(/([:\\\\])/g, (c) => (c === ':' ? '\\:' : '\\\\'))}`;
  let lines = [];
  if (existsSync(lp)) {
    lines = readFileSync(lp, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !/^sdk\.dir\s*=/.test(l));
  }
  lines.push(line);
  writeFileSync(lp, `${lines.join('\n')}\n`);
  log(`已写入 local.properties: ${line}`);
}

/* ---------------- 3. 执行 ---------------- */

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: IS_WIN,
    ...opts,
  });
  if (r.status !== 0) {
    fail(`${cmd} ${args.join(' ')} 退出码 ${r.status ?? 'null'}`);
  }
}

function main() {
  const tasks = process.argv.slice(2);
  if (tasks.length === 0) tasks.push('assembleDebug');

  const jdk = resolveJdk();
  if (!jdk) {
    fail(
      '未找到 JDK 17（AGP 8.2 要求）。请安装 JDK 17 并设置 JAVA_HOME，例如：\n' +
        '  • Linux/macOS:  https://adoptium.net/temurin/releases/?version=17 解压后 export JAVA_HOME=<目录>\n' +
        '  • Windows:     安装后自动设置 JAVA_HOME，或放到 C:\\Program Files\\Java\\jdk-17\n' +
        '  • 或用 Android Studio 打开 apps/mobile/android（IDE 自带 JBR 17）',
    );
  }

  const sdk = resolveSdk();
  if (!sdk) {
    fail(
      '未找到 Android SDK。请安装 Android Studio（默认会装 SDK），或设置 ANDROID_HOME，\n' +
        'SDK 组件要求：platforms;android-34 / build-tools;34.0.0 / ndk;25.1.8937393 / cmake;3.22.1',
    );
  }
  if (!sdk.fromLocalProps) ensureLocalProperties(sdk.dir);

  const env = { ...process.env };
  if (jdk.home) {
    env.JAVA_HOME = jdk.home;
    env.PATH = `${path.join(jdk.home, 'bin')}${path.delimiter}${env.PATH ?? ''}`;
  }
  env.ANDROID_HOME = sdk.dir;
  env.ANDROID_SDK_ROOT = sdk.dir;

  log('[1/2] cap sync android');
  run(IS_WIN ? 'npx.cmd' : 'npx', ['cap', 'sync', 'android'], { cwd: MOBILE_DIR, env });

  log(`[2/2] gradlew ${tasks.join(' ')}`);
  const gradlew = IS_WIN ? 'gradlew.bat' : './gradlew';
  run(gradlew, tasks, { cwd: ANDROID_DIR, env });

  log('完成。APK 输出：android/app/build/outputs/apk/<variant>/');
}

main();
