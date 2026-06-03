import path from 'node:path';

import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import type { Configuration } from 'webpack';
import type { Configuration as DevServerConfiguration } from 'webpack-dev-server';

import { commonResolve, esmCompatRule, isDev, swcLoader } from './webpack.common';

const devServer: DevServerConfiguration = {
  port: 3000,
  hot: true,
  liveReload: false,
  static: {
    directory: path.resolve(__dirname, 'public'),
  },
  historyApiFallback: true,
  client: {
    overlay: { errors: true, warnings: false },
  },
};

const config: Configuration & { devServer?: DevServerConfiguration } = {
  mode: isDev ? 'development' : 'production',
  target: 'web',
  entry: path.resolve(__dirname, 'src/renderer/index.tsx'),
  output: {
    path: path.resolve(__dirname, 'dist/renderer'),
    filename: isDev ? 'assets/[name].js' : 'assets/[name].[contenthash:8].js',
    chunkFilename: isDev ? 'assets/[name].chunk.js' : 'assets/[name].[contenthash:8].chunk.js',
    assetModuleFilename: 'assets/[hash][ext]',
    publicPath: isDev ? '/' : './',
    clean: true,
  },
  resolve: {
    ...commonResolve,
    fallback: {
      path: false,
      fs: false,
      os: false,
    },
  },
  module: {
    rules: [
      esmCompatRule,
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: swcLoader,
      },
      {
        test: /\.css$/,
        use: [isDev ? 'style-loader' : MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader'],
      },
      { test: /\.svg$/, type: 'asset/resource' },
      {
        test: /\.(png|jpg|jpeg|webp|gif|woff|woff2|ttf|otf)$/,
        type: 'asset',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'src/renderer/index.html'),
      inject: 'body',
      minify: !isDev,
      templateParameters: {
        csp:
          [
            "default-src 'self'",
            `script-src 'self' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "connect-src 'self' ws://localhost:* http://localhost:* https:",
            'frame-src https: http:',
            "object-src 'none'",
            "base-uri 'self'",
          ].join('; ') + ';',
      },
    }),
    ...(!isDev
      ? [
          new MiniCssExtractPlugin({
            filename: 'assets/[name].[contenthash:8].css',
          }),
        ]
      : []),
  ],
  optimization: {
    splitChunks: { chunks: 'all' },
    runtimeChunk: 'single',
    minimize: !isDev,
  },
  devtool: isDev ? 'eval-cheap-module-source-map' : 'source-map',
  performance: { hints: false },
  stats: 'minimal',
  devServer,
};

export default config;
