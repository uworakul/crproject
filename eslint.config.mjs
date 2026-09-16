// NOTE: We compose flat configs directly instead of using @eslint/eslintrc's
// FlatCompat (i.e. compat.extends("next/core-web-vitals")). With this
// toolchain (eslint 9.39.5 + eslint-config-next 16.3.5 + eslint-plugin-react
// 7.37.5), FlatCompat throws "TypeError: Converting circular structure to
// JSON" — the underlying plugin objects are self-referencing (a normal,
// valid flat-config pattern; ESLint itself handles it fine), but
// @eslint/eslintrc's legacy config-validator tries to JSON.stringify them
// for error formatting and crashes. Using each plugin's native flat export
// avoids that legacy bridge entirely.
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const eslintConfig = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat["jsx-runtime"],
  reactHooksPlugin.configs.flat.recommended,
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  {
    settings: {
      react: { version: "detect" },
    },
  },
  {
    ignores: ["generated/**", "node_modules/**", ".next/**"],
  },
];

export default eslintConfig;
