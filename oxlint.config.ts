import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: ["tools/oxlint/anti-slop/**"],
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
  ],
  rules: {
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "warn",
  },
});
