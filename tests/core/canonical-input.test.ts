import assert from "node:assert/strict";
import test from "node:test";

import {
  isCanonicalInput,
  isCanonicalProject,
} from "../../src/core/canonical-input.js";

test("identifiers already used by Loop Engine are canonical", () => {
  for (const value of [
    "job-1",
    "cycle:v15.1:1",
    "cycle:roadmap:42",
    "worker:first",
    "n8n-worker-1",
    "loop-engine-cli:12345",
    "auto-subscription:creatyss:VNEXT4-S6A:1234567890123456789012345678901234567890",
    "a",
    "café", // non-ASCII is not rejected by this rule (open arbitration)
  ]) {
    assert.equal(isCanonicalInput(value), true, value);
  }
});

test("non-canonical text is refused, never normalized", () => {
  const refused: unknown[] = [
    "",
    " ",
    " k",
    "k ",
    "\tk",
    "k\n",
    "k\r\n",
    "k ", // no-break space (removed by trim)
    "﻿k", // BOM (removed by trim)
    "k ", // line separator (removed by trim)
    "a\tb",
    "a\nb",
    "a\u0000b",
    "a\u007fb",
    "a\u0085b", // C1 control NEL
    "a\u001bb",
    undefined,
    null,
    0,
    1,
    true,
    {},
    [],
    ["k"],
    new String("k"),
  ];
  for (const value of refused) {
    assert.equal(isCanonicalInput(value), false, JSON.stringify(value));
  }
});

test("project designations follow the registry name rule", () => {
  for (const value of [
    "loop-engine",
    "creatyss",
    "project-a",
    "a".repeat(63),
  ]) {
    assert.equal(isCanonicalProject(value), true, value);
  }
  for (const value of [
    "",
    " loop-engine",
    "loop-engine ",
    "Loop-Engine",
    "loop_engine",
    "loop.engine",
    "-lead",
    "a".repeat(64),
    undefined,
    null,
    42,
  ]) {
    assert.equal(isCanonicalProject(value), false, String(value));
  }
});
