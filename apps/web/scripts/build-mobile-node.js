import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, '..');
const distNodejs = path.join(webRoot, 'dist', 'nodejs');
const distServer = path.join(webRoot, 'dist-server');

try {
  console.log('Building mobile nodejs backend...');

  // Clean old nodejs folder
  if (fs.existsSync(distNodejs)) {
    fs.rmSync(distNodejs, { recursive: true, force: true });
  }
  fs.mkdirSync(distNodejs, { recursive: true });

  if (!fs.existsSync(distServer)) {
    console.error('error: dist-server folder not found. Please compile the server first.');
    process.exit(1);
  }

  if (!fs.existsSync(path.join(distServer, 'index.js'))) {
    console.error('error: dist-server/index.js not found. Please compile the server first.');
    process.exit(1);
  }

  // Use esbuild to bundle the server into a single self-contained file.
  // All JS dependencies (fastify, ws, pino, zod, superjson, @xiabao/server, etc.)
  // are inlined. Only @libsql/client stays external because it ships a platform-specific
  // native .node addon. A stub is then generated for it (see below).
  const esbuild = await import('esbuild');

  await esbuild.build({
    entryPoints: [path.join(distServer, 'index.js')],
    outfile: path.join(distNodejs, 'index.js'),
    platform: 'node',
    target: 'node20',
    format: 'esm',
    bundle: true,
    external: ['@libsql/client'],
    logLevel: 'warning',
    define: {
      'process.env.XIABAO_PLATFORM': JSON.stringify('mobile'),
    },
  });

  console.log('✓ Bundled server with esbuild');

  // Generate a stub for @libsql/client so the externalized import resolves at runtime
  // without crashing. All methods return empty results (no persistence on mobile for now).
  const stubDir = path.join(distNodejs, 'node_modules', '@libsql', 'client');
  fs.mkdirSync(stubDir, { recursive: true });

  fs.writeFileSync(
    path.join(stubDir, 'package.json'),
    JSON.stringify(
      { name: '@libsql/client', version: '0.0.0-stub', main: 'index.js', type: 'module' },
      null,
      2,
    ),
    'utf-8',
  );

  fs.writeFileSync(
    path.join(stubDir, 'index.js'),
    `
const noop = () => new Proxy({}, { get: () => () => Promise.resolve({ rows: [], columns: [], toJSON: () => '[]' }) });
export function createClient() { return noop(); }
export default { createClient };
`.trimStart(),
    'utf-8',
  );

  console.log('✓ Generated @libsql/client stub for mobile');

  // package.json — capacitor-nodejs requires a valid package.json in the node dir
  fs.writeFileSync(
    path.join(distNodejs, 'package.json'),
    JSON.stringify(
      {
        name: 'xiabao-mobile-backend',
        version: '1.0.0',
        main: 'index.js',
        private: true,
        type: 'module',
      },
      null,
      2,
    ),
    'utf-8',
  );

  console.log('✓ nodejs backend ready');
} catch (err) {
  console.error('Failed to build mobile node files:', err);
  process.exit(1);
}
