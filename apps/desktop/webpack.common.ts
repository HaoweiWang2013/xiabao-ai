import path from 'node:path';
import type { Configuration } from 'webpack';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';

export const isDev = process.env.NODE_ENV !== 'production';

export const commonResolve: Configuration['resolve'] = {
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.mjs'],
  // Monorepo 内部 ESM 包（@xiabao/*）tsc 产物未带扩展名，这里放宽 fullySpecified
  fullySpecified: false,
  alias: {
    '@main': path.resolve(__dirname, 'src/main'),
    '@preload': path.resolve(__dirname, 'src/preload'),
    '@renderer': path.resolve(__dirname, 'src/renderer'),
  },
  plugins: [
    new TsconfigPathsPlugin({
      configFile: path.resolve(__dirname, 'tsconfig.json'),
    }),
  ],
};

/**
 * 关闭 .mjs / .js 的 fullySpecified 要求，必须在 module.rules 里单独加规则：
 * webpack 5 规定 .mjs 一定是严格 ESM，resolve.fullySpecified=false 无效，
 * 必须在 rules 下匹配后解除。
 */
export const esmCompatRule = {
  test: /\.m?js$/,
  resolve: { fullySpecified: false },
};

export const swcLoader = {
  loader: 'swc-loader',
  options: {
    jsc: {
      parser: {
        syntax: 'typescript',
        tsx: true,
        decorators: false,
      },
      transform: {
        react: {
          runtime: 'automatic',
          development: isDev,
          refresh: false,
        },
      },
      target: 'es2022',
    },
    sourceMaps: true,
  },
};
