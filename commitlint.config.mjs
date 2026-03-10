/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'header-jira-pattern': ({ header }) => {
          const RE =
            /^(feat|fix|docs|style|refactor|test|chore|ci|build|perf|revert)\([\w-]+\): .+?( \([A-Z]+-\d+\))?\s*$/;
          if (!RE.test(header)) {
            return [
              false,
              `header must match format: type(scope): description (JIRA-ID)\n` +
                `Example: feat(payments): implement stripe webhooks (VL-42)`,
            ];
          }
          return [true];
        },
      },
    },
  ],
  rules: {
    'header-jira-pattern': [2, 'always'],
    'type-empty': [0],
    'subject-empty': [0],
    'subject-case': [0],
    'header-trim': [2, 'always'],
  },
};
