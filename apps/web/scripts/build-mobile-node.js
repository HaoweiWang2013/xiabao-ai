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
  // CJS format so all require() calls work naturally.
  // Only @libsql/client and undici stay external (they have platform-specific issues).
  const esbuild = await import('esbuild');

  await esbuild.build({
    entryPoints: [path.join(distServer, 'index.js')],
    outfile: path.join(distNodejs, 'index.js'),
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    bundle: true,
    external: ['@libsql/client', 'undici', 'bridge'],
    logLevel: 'warning',
    define: {
      'process.env.XIABAO_PLATFORM': JSON.stringify('mobile'),
    },
    plugins: [
      {
        name: 'import-meta-url',
        setup(build) {
          // Replace fileURLToPath(import.meta.url) → __filename (CJS compatible)
          // Only transform our own pre-compiled source, not node_modules
          build.onLoad({ filter: /dist-server[\\/]/, namespace: 'file' }, async (args) => {
            const fs = await import('fs');
            let source = fs.readFileSync(args.path, 'utf-8');
            if (source.includes('import.meta.url')) {
              source = source.replace(/fileURLToPath\(import\.meta\.url\)/g, '__filename');
              source = source.replace(/import\.meta\.url/g, '__filename');
              return { contents: source, loader: 'default' };
            }
            return null;
          });
        },
      },
    ],
  });

  console.log('✓ Bundled server with esbuild');

  // Generate stub for undici (externalized, some deps require('undici') directly)
  const undiciStubDir = path.join(distNodejs, 'node_modules', 'undici');
  fs.mkdirSync(undiciStubDir, { recursive: true });
  fs.writeFileSync(
    path.join(undiciStubDir, 'package.json'),
    JSON.stringify({ name: 'undici', version: '0.0.0-stub', main: 'index.js' }),
  );
  fs.writeFileSync(
    path.join(undiciStubDir, 'index.js'),
    `// Stub: re-export Node.js 18+ native fetch globals
module.exports = {
  fetch: globalThis.fetch,
  Response: globalThis.Response,
  Request: globalThis.Request,
  Headers: globalThis.Headers,
  FormData: globalThis.FormData,
  ReadableStream: globalThis.ReadableStream,
  Blob: globalThis.Blob,
  File: class File extends Blob {
    constructor(bits, name, opts) {
      super(bits, opts);
      this.name = name || '';
      this.lastModified = opts?.lastModified || Date.now();
    }
  },
};
`,
    'utf-8',
  );
  console.log('✓ Generated undici stub for mobile');

  // Generate stub for @libsql/client (externalized, no real DB on mobile)
  const stubDir = path.join(distNodejs, 'node_modules', '@libsql', 'client');
  fs.mkdirSync(stubDir, { recursive: true });

  fs.writeFileSync(
    path.join(stubDir, 'package.json'),
    JSON.stringify({ name: '@libsql/client', version: '0.0.0-stub', main: 'index.js' }),
  );

  fs.writeFileSync(
    path.join(stubDir, 'index.js'),
    `// CJS stub — all methods return empty results (no persistence on mobile)
const noop = function() {
  return new Proxy({}, {
    get: function(_, prop) {
      return function() { return Promise.resolve({ rows: [], columns: [], toJSON: function() { return '[]'; } }); };
    }
  });
};
module.exports.createClient = noop;
`,
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
