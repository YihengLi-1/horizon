module.exports = {
  root: true,
  ignorePatterns: ["node_modules", "dist", ".next"],
  extends: ["next/core-web-vitals"],
  overrides: [
    {
      files: ["apps/api/**/*.ts", "packages/shared/**/*.ts"],
      parserOptions: {
        project: null
      },
      rules: {
        "@typescript-eslint/no-explicit-any": "off"
      }
    }
  ]
};
