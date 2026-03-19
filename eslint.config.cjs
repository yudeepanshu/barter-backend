module.exports = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        NodeJS: true,
      },
    },
    rules: {
      "semi": ["error", "always"],
      "quotes": ["error", "single"],
      "comma-dangle": ["error", "always-multiline"],
    },
  },
];

