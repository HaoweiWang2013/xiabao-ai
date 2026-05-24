import path from 'node:path';

import type { Configuration } from 'webpack';

import { commonResolve, esmCompatRule, isDev, swcLoader } from './webpack.common';

const config: Configuration = {
  mode: isDev ? 'development' : 'production',
  target: 'electron-preload',
  entry: path.resolve(__dirname, 'src/preload/index.ts'),
  output: {
    path: path.resolve(__dirname, 'dist/preload'),
    filename: 'index.js',
    clean: true,
  },
  resolve: commonResolve,
  module: {
    rules: [esmCompatRule, { test: /\.tsx?$/, exclude: /node_modules/, use: swcLoader }],
  },
  devtool: isDev ? 'source-map' : 'source-map',
  optimization: {
    minimize: !isDev,
  },
  stats: 'minimal',
};

export default config;
