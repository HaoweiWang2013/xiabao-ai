import path from 'node:path';

import CopyPlugin from 'copy-webpack-plugin';
import type { Configuration } from 'webpack';
import webpack from 'webpack';

import { commonResolve, esmCompatRule, isDev, swcLoader } from './webpack.common';

const config: Configuration = {
  mode: isDev ? 'development' : 'production',
  target: 'electron-main',
  entry: path.resolve(__dirname, 'src/main/index.ts'),
  output: {
    path: path.resolve(__dirname, 'dist/main'),
    filename: 'index.js',
    clean: true,
  },
  resolve: commonResolve,
  module: {
    rules: [
      esmCompatRule,
      { test: /\.tsx?$/, exclude: /node_modules/, use: swcLoader },
      { test: /\.node$/, loader: 'node-loader' },
    ],
  },
  externals: {
    // @libsql/client 含原生 .node 模块，不能打包
    '@libsql/client': 'commonjs @libsql/client',
    // M4 长尾 Phase 5-Pro：本地 embedder 推理依赖
    // - onnxruntime-node：native binding，必须留给 Node runtime require
    // - @huggingface/transformers：内部 dynamic import('onnxruntime-node') 等，整包 externalize 最稳
    // - sharp：native binding（图像处理；transformers.js 间接依赖）
    'onnxruntime-node': 'commonjs onnxruntime-node',
    '@huggingface/transformers': 'commonjs @huggingface/transformers',
    sharp: 'commonjs sharp',
    // argon2：native binding（Argon2id KDF，crypto/sync 依赖），必须 externalize
    argon2: 'commonjs argon2',
  },
  plugins: [
    new webpack.DefinePlugin({
      __BUILD_HASH__: JSON.stringify(process.env.BUILD_HASH ?? 'dev'),
      __DEV__: JSON.stringify(isDev),
    }),
    // 把 Drizzle 迁移 SQL 拷贝到 dist/main/migrations/
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, '../../packages/server/src/db/migrations'),
          to: path.resolve(__dirname, 'dist/main/migrations'),
          globOptions: { ignore: ['**/*.ts'] },
        },
      ],
    }),
  ],
  node: {
    __dirname: false,
    __filename: false,
  },
  devtool: isDev ? 'source-map' : 'source-map',
  optimization: {
    minimize: !isDev,
  },
  stats: 'minimal',
};

export default config;
