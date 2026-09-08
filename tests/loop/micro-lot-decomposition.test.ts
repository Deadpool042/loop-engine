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
