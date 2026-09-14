import { RuleTester } from "oxlint/plugins-dev";

import { noChainedTypeAssertionsRule } from "./rules/no-chained-type-assertions.ts";
import { noReduceAccumulatorCopyRule } from "./rules/no-reduce-accumulator-copy.ts";
import { noWidenThenAssertRule } from "./rules/no-widen-then-assert.ts";
import { requireSafetyCommentForTypeAssertionRule } from "./rules/require-safety-comment-for-type-assertion.ts";

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" }, sourceType: "module" },
});

tester.run("no-chained-type-assertions", noChainedTypeAssertionsRule, {
  valid: ["const value = 1 as const;"],
  invalid: [{
    code: "const value = 1 as unknown as string;",
    errors: [{ messageId: "chained" }],
  }],
});

tester.run("no-reduce-accumulator-copy", noReduceAccumulatorCopyRule, {
  valid: [
    "declare const values: Iterable<number>; values.reduce((acc: number[], value) => acc.concat(value));",
    "[1, 2].reduce((sum, value) => sum + value, 0);",
  ],
  invalid: [
    {
      code: "[[] as number[], [1]].reduce((acc, value) => acc.concat(value));",
      errors: [{ messageId: "accumulatorCopy" }],
    },
    {
      code: "[1, 2].reduce((acc, value) => acc.concat(value), [] as number[]);",
      errors: [{ messageId: "accumulatorCopy" }],
    },
  ],
});

tester.run("no-widen-then-assert", noWidenThenAssertRule, {
  valid: ["const value = { id: 1 } as { id: number };"],
  invalid: [{
    code: "const broad: unknown = { id: 1 }; const value = broad as { id: number };",
    errors: [{ messageId: "widenThenAssert" }],
  }],
});

tester.run("require-safety-comment-for-type-assertion", requireSafetyCommentForTypeAssertionRule, {
  valid: ["// SAFETY: parsed by the caller\nconst value = input as string;"],
  invalid: [{
    code: "const value = input as string;",
    errors: [{ messageId: "missingSafetyComment" }],
  }],
});
