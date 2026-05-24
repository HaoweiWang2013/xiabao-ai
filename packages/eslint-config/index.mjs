// Re-export root flat config so subpackages can extend it.
// Actual rules live in repo root `eslint.config.mjs`.
// This placeholder allows per-package `eslint.config.mjs` such as:
//
//   import xiabaoConfig from '@xiabao/eslint-config';
//   export default xiabaoConfig;
//
// For now it is a thin pass-through.
export { default } from '../../eslint.config.mjs';
