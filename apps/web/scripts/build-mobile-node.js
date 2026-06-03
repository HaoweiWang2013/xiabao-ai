import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, '..');
const distNodejs = path.join(webRoot, 'dist', 'nodejs');
const distServer = path.join(webRoot, 'dist-server');

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  console.log('Copying server files for mobile nodejs background process...');

  // Clean old nodejs folder
  if (fs.existsSync(distNodejs)) {
    fs.rmSync(distNodejs, { recursive: true, force: true });
  }
  fs.mkdirSync(distNodejs, { recursive: true });

  // Copy compiled server files
  if (fs.existsSync(distServer)) {
    copyDirSync(distServer, distNodejs);
    console.log('✓ Successfully copied server files');
  } else {
    console.error('✗ error: dist-server folder not found. Please compile the server first.');
    process.exit(1);
  }

  // Create package.json inside nodejs folder with type: "module" and correct main
  const pkgContent = {
    name: 'xiabao-mobile-backend',
    version: '1.0.0',
    main: 'index.js',
    private: true,
    type: 'module',
    dependencies: {
      fastify: '4.28.1',
      '@fastify/cors': '9.0.1',
      '@fastify/static': '7.0.4',
      '@libsql/client': '0.10.0',
      pino: '9.3.2',
      ws: '8.18.0',
      zod: '3.23.8',
      superjson: '2.2.1',
    },
  };

  fs.writeFileSync(
    path.join(distNodejs, 'package.json'),
    JSON.stringify(pkgContent, null, 2),
    'utf-8',
  );
  console.log('✓ Successfully generated package.json in dist/nodejs/');
} catch (err) {
  console.error('Failed to copy mobile node files:', err);
  process.exit(1);
}
