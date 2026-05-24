/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'core',
        'ui',
        'ui-native',
        'state',
        'theme',
        'i18n',
        'crypto',
        'sync',
        'testing',
        'tsconfig',
        'eslint-config',
        'desktop',
        'web',
        'mobile',
        'web-proxy',
        'docs',
        'ci',
        'deps',
        'infra',
        'release',
      ],
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 100],
  },
};
