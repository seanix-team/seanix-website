module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'ui',
        'feat',
        'fix',
        'refactor',
        'docs',
        'chore',
        'style',
        'revert',
        'init',
        'docker',
        'ci',
        'test',
        'release',
        'prune',
        'types',
        'merge',
        'pref',
      ],
    ],
  },
};
