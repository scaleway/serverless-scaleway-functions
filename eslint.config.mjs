import { defineConfig } from "eslint/config";
import js from "@eslint/js";

export default defineConfig([
  {
    languageOptions: {
      globals: {
        process: "readonly",
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
        console: "readonly",
        jest: "readonly",
        setTimeout: "readonly",
      },
    },
  },
  {
    files: ["**/*.js"],
    plugins: { js },
    extends: ["js/recommended"],
    ignores: ["examples/**/*.js"],
  },
  { files: ["tests/**/*.test.js"], rules: { "no-unused-vars": "off" } },
]);
