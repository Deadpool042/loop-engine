import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAutoMicroLotPlanningInstructions,
  decomposeOversizedAutoCandidate,
} from "../../src/loop/micro-lot-decomposition.js";

const candidate = Object.freeze({
  id: "H3-L3",
  path: "docs/roadmap/vnext3.md",
  line: 42,
  text: "- [ ] H3-L3 — Deliver the complete generation-three workflow",
  kind: "safe" as const,
  reason: "no sensitive keyword detected",
  status: "todo" as const,
  priority: "p1" as const,
});

test("AUTO deterministically splits a G3-like oversized candidate into traceable resumable micro-lots", () => {
  const input = {
    candidate,
    sourceDocument: "docs/roadmap/vnext3.md",
    allowedPaths: [
      "src/g3/a.ts",
      "src/g3/b.ts",
      "src/g3/c.ts",
      "src/g3/d.ts",
      "tests/g3.test.ts",
      "docs/roadmap/vnext3.md",
    ],
    brief: {
      objective: "Deliver G3 without a monolithic provider run.",
      deliverables: [
        "Implement the G3 state contract.",
        "Implement the G3 continuation flow.",
        "Add the bounded G3 adapter.",
        "Add the G3 regression coverage.",
        "Update docs/roadmap/vnext3.md candidate state.",
      ],
      outOfScope: ["Deployment"],
    },
  } as const;

  const first = decomposeOversizedAutoCandidate(input);
  const second = decomposeOversizedAutoCandidate(input);

  assert.deepEqual(first, second);
  assert.equal(first.candidate.id, "H3-L3.M1");
  assert.equal(first.decomposition?.parentCandidate.id, "H3-L3");
  assert.equal(first.decomposition?.selectedChildId, "H3-L3.M1");
  assert.deepEqual(
    first.decomposition?.children.map((child) => ({
      id: child.id,
      status: child.status,
      pathCount: child.allowedPaths.length,
      deliverableCount: child.deliverables.length,
    })),
    [
      { id: "H3-L3.M1", status: "selected", pathCount: 3, deliverableCount: 1 },
      { id: "H3-L3.M2", status: "pending", pathCount: 3, deliverableCount: 1 },
      { id: "H3-L3.M3", status: "pending", pathCount: 2, deliverableCount: 1 },
      { id: "H3-L3.M4", status: "pending", pathCount: 2, deliverableCount: 1 },
    ],
  );
  assert.deepEqual(first.allowedPaths, [
    "docs/roadmap/vnext3.md",
    "src/g3/a.ts",
    "src/g3/b.ts",
  ]);
  assert.deepEqual(first.brief?.deliverables, [
    "Implement the G3 state contract.",
    "Update docs/roadmap/vnext3.md candidate state.",
  ]);
  assert.ok(
    first.decomposition?.children.every((child) =>
      child.allowedPaths.includes("docs/roadmap/vnext3.md"),
    ),
  );
  const instructions = buildAutoMicroLotPlanningInstructions(
    first.decomposition!,
  );
  assert.ok(
    instructions.includes("- [x] H3-L3.M1 — Implement the G3 state contract."),
  );
  assert.ok(
    instructions.includes(
      "- [ ] H3-L3.M2 — Implement the G3 continuation flow.",
    ),
  );
  assert.ok(
    instructions.includes(
      "### H3-L3.M2 — Deliver G3 without a monolithic provider run. (2/4)",
    ),
  );
  assert.ok(instructions.includes("- `src/g3/c.ts`"));
});

test("AUTO keeps explicitly referenced writable paths with their deliverable", () => {
  const result = decomposeOversizedAutoCandidate({
    candidate: {
      ...candidate,
      id: "VNEXT3-G3.M2",
      path: "docs/roadmap/README.md",
      line: 67,
      text: "- [ ] VNEXT3-G3.M2 — Checkout entities updated to include gift context",
    },
    sourceDocument: "docs/roadmap/README.md",
    allowedPaths: [
      "docs/roadmap/README.md",
      "docs/roadmap/cycle-continuite-client-vnext3.md",
      "docs/testing/2026-09-08-vnext3-g3-gifting-staging-recipe.md",
      "entities/checkout/**",
    ],
    brief: {
      objective: "Implement Gifting V1 checkout entity change.",
      deliverables: [
        "Update entities/checkout/** to introduce a GiftRequest aggregate.",
        "Update docs/roadmap/README.md to record progress.",
        "Update docs/roadmap/cycle-continuite-client-vnext3.md with progress notes.",
        "Update docs/testing/2026-09-08-vnext3-g3-gifting-staging-recipe.md with the staging recipe.",
      ],
      outOfScope: ["No deployment."],
    },
  });

  const children = result.decomposition?.children ?? [];
  assert.equal(children[0]?.id, "VNEXT3-G3.M2.M1");
  assert.deepEqual(children[0]?.deliverables, [
    "Update entities/checkout/** to introduce a GiftRequest aggregate.",
  ]);
  assert.ok(children[0]?.allowedPaths.includes("entities/checkout/**"));
  assert.ok(
    children[0]?.allowedPaths.includes(
      "docs/roadmap/cycle-continuite-client-vnext3.md",
    ),
  );
  assert.equal(
    children[0]?.allowedPaths.includes(
      "docs/testing/2026-09-08-vnext3-g3-gifting-staging-recipe.md",
    ),
    false,
  );

  assert.equal(children[1]?.id, "VNEXT3-G3.M2.M2");
  assert.deepEqual(children[1]?.deliverables, [
    "Update docs/testing/2026-09-08-vnext3-g3-gifting-staging-recipe.md with the staging recipe.",
  ]);
  assert.ok(
    children[1]?.allowedPaths.includes(
      "docs/testing/2026-09-08-vnext3-g3-gifting-staging-recipe.md",
    ),
  );
});

test("AUTO never recursively decomposes an existing micro-lot child", () => {
  const childCandidate = Object.freeze({
    ...candidate,
    id: "VNEXT3-G3.M2",
    path: "docs/roadmap/README.md",
    line: 67,
    text: "- [ ] VNEXT3-G3.M2 — Checkout entities updated to include gift context",
  });

  const result = decomposeOversizedAutoCandidate({
    candidate: childCandidate,
    sourceDocument: "docs/roadmap/README.md",
    allowedPaths: [
      "docs/roadmap/README.md",
      "docs/roadmap/cycle-continuite-client-vnext3.md",
      "docs/testing/2026-09-08-vnext3-g3-gifting-staging-recipe.md",
      "entities/checkout/**",
    ],
    brief: {
      objective: "Implement the Gifting V1 checkout entity change.",
      deliverables: [
        "Update entities/checkout/** to introduce a GiftRequest aggregate.",
        "Update docs/roadmap/README.md to record progress.",
        "Update docs/roadmap/cycle-continuite-client-vnext3.md with progress notes.",
        "Update docs/testing/2026-09-08-vnext3-g3-gifting-staging-recipe.md with the staging recipe.",
      ],
      outOfScope: ["No deployment."],
    },
  });

  assert.equal(result.candidate, childCandidate);
  assert.equal(result.decomposition, undefined);
  assert.deepEqual(result.allowedPaths, [
    "docs/roadmap/README.md",
    "docs/roadmap/cycle-continuite-client-vnext3.md",
    "docs/testing/2026-09-08-vnext3-g3-gifting-staging-recipe.md",
    "entities/checkout/**",
  ]);
});

test("AUTO leaves an already bounded candidate unchanged", () => {
  const result = decomposeOversizedAutoCandidate({
    candidate,
    sourceDocument: "docs/roadmap/vnext3.md",
    allowedPaths: ["src/g3/a.ts", "docs/roadmap/vnext3.md"],
    brief: {
      objective: "Implement one bounded change.",
      deliverables: ["Implement one bounded change."],
      outOfScope: ["Everything else"],
    },
  });

  assert.equal(result.candidate, candidate);
  assert.equal(result.decomposition, undefined);
});
