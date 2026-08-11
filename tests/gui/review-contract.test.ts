import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseReviewDetail } from "../../src/gui/desktop/review-contract.js";

describe("GUI review contract", () => {
  it("accepts only the review fields rendered by the detail panel", () => {
    assert.deepEqual(
      parseReviewDetail({
        schemaVersion: 1,
        git: { branch: "main", clean: false, requiresGit: true },
        gitStatus: " M src/cli.ts",
        diffStat: " src/cli.ts | 2 +-",
        documentationImpact: {
          changedPaths: ["src/cli.ts"],
          impacts: [
            {
              document: "docs/architecture/commands.md",
              reason: "CLI command surface changed",
              required: true,
            },
          ],
          semanticReviewRequired: true,
        },
        validation: { configured: true, commands: ["pnpm run validate"] },
        health: "warning",
      }),
      {
        git: { branch: "main", clean: false, requiresGit: true },
        gitStatus: " M src/cli.ts",
        diffStat: " src/cli.ts | 2 +-",
        documentationImpact: {
          changedPaths: ["src/cli.ts"],
          impacts: [
            {
              document: "docs/architecture/commands.md",
              reason: "CLI command surface changed",
              required: true,
            },
          ],
          semanticReviewRequired: true,
        },
        validation: { configured: true, commands: ["pnpm run validate"] },
        health: "warning",
      },
    );
  });

  it("rejects malformed review fields", () => {
    assert.equal(
      parseReviewDetail({
        schemaVersion: 1,
        git: { branch: "main", clean: true, requiresGit: true },
        gitStatus: "",
        diffStat: "",
        documentationImpact: {
          changedPaths: [],
          impacts: [],
          semanticReviewRequired: "no",
        },
        validation: { configured: true, commands: [] },
        health: "good",
      }),
      null,
    );
  });
});
