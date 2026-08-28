import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: ["dist/**", "examples/**/*.ts"],
  },
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
  {
    // Jest injects these as real globals at runtime by default
    // (injectGlobals isn't disabled anywhere in this repo's jest config) -
    // every test file used to import them from @jest/globals purely to
    // satisfy this rule, not because the import did anything at runtime.
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        beforeEach: "readonly",
        afterAll: "readonly",
        afterEach: "readonly",
      },
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      // `import X = require("Y")` is this repo's deliberate pattern for
      // every file that exports a single class/value via `export =`
      // (docs/fixing-plan.md M7): it compiles to a plain CJS require(), so
      // it doesn't trip Bun's transpiler the way `import X from "Y"` does
      // when combined with `export =`, while still giving real type
      // inference unlike a bare `require()` call.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // shared/api/index.ts intentionally uses declaration merging (a class
    // plus a same-named interface) to give the mixin classes' Object.assign
    // -built shape a real static type - see the comment at the top of that
    // file. That's exactly the pattern these two rules exist to catch in
    // the general case, so they're disabled here specifically, not
    // repo-wide.
    files: ["shared/api/index.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
]);
