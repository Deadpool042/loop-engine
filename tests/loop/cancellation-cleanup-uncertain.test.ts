import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { runDurableAutoSubscriptionPublish } from "../../src/composition/durable-auto-publish.js";
import {
  CANCELLATION_CLEANUP_FAILED_CODE,
  EXECUTION_CANCELLED_CODE,
} from "../../src/loop/cancellation.js";
import { runDurableLoopExecution } from "../../src/loop/durable-execution-controller.js";
import {
  createFileDurableExecutionStore,
  readFileDurableExecutionRecords,
} from "../../src/loop/file-durable-execution-store.js";
import { recoverDurableExecution } from "../../src/loop/durable-execution-recovery.js";
import { createInMemoryDurableExecutionStore } from "../../src/loop/in-memory-durable-execution-store.js";
import type { LoopRunResult } from "../../src/loop/types.js";
import { completedResult } from "./support/synthetic.js";

// Qualification de l'arrêt INCERTAIN : l'annulation a été demandée mais la
// terminaison du processus n'a pas pu être prouvée (`cancellation_cleanup_failed`).
// Invariants : aucun succès, aucun échec masqué, aucun processus possiblement
// actif considéré comme arrêté, aucune reprise sur la seule base de `cancelled`.

const request = (owner: string, retryTerminal = false) =>
  Object.freeze({
    idempotencyKey: "idem-cleanup-uncertain",
    project: "synthetic",
    owner,
    leaseDurationMs: 600_000,
    ...(retryTerminal ? { retryTerminal: true as const } : {}),
  });

function cancelled(code: string): LoopRunResult {
  return Object.freeze({
    ...completedResult(),
    status: "cancelled" as const,
    failure: Object.freeze({
      code,
      message:
        code === CANCELLATION_CLEANUP_FAILED_CODE
          ? "Codex processes could not be proven terminated after the cancellation."
          : "Execution was cancelled before completion.",
      details: Object.freeze(["Cancellation cause: lease_lost"]),
    }),
  }) as LoopRunResult;
}

describe("arrêt incertain après annulation (cancellation_cleanup_failed)", () => {
  it("U1 — est persisté comme cancelled avec son code d'échec de nettoyage, jamais comme completed", async () => {
    const store = createInMemoryDurableExecutionStore();
    const outcome = await runDurableLoopExecution(
      store,
      request("worker-a"),
      async () => cancelled(CANCELLATION_CLEANUP_FAILED_CODE),
    );
    assert.equal(outcome.status, "executed");
    const record = outcome.status === "executed" ? outcome.record : null;
    assert.equal(record?.status, "cancelled");
    assert.equal(record?.failure?.code, CANCELLATION_CLEANUP_FAILED_CODE);
    assert.equal(record?.result, null);
    assert.equal(record?.leaseOwner, null);
  });

  it("U2 — un nouveau retryTerminal sur un arrêt incertain est refusé et n'exécute rien", async () => {
    const store = createInMemoryDurableExecutionStore();
    await runDurableLoopExecution(store, request("worker-a"), async () =>
      cancelled(CANCELLATION_CLEANUP_FAILED_CODE),
    );
    let calls = 0;
    const retry = await runDurableLoopExecution(
      store,
      request("worker-b", true),
      async () => {
        calls += 1;
        return completedResult();
      },
    );
    assert.equal(retry.status, "rejected");
    assert.equal(
      calls,
      0,
      "aucune exécution ne doit démarrer sur un arrêt incertain",
    );
    assert.equal(
      (await store.load("idem-cleanup-uncertain"))?.status,
      "cancelled",
    );
  });

  it("U3 — sans retryTerminal, l'enregistrement est rejoué tel quel (aucune exécution)", async () => {
    const store = createInMemoryDurableExecutionStore();
    await runDurableLoopExecution(store, request("worker-a"), async () =>
      cancelled(CANCELLATION_CLEANUP_FAILED_CODE),
    );
    let calls = 0;
    const replay = await runDurableLoopExecution(
      store,
      request("worker-b"),
      async () => {
        calls += 1;
        return completedResult();
      },
    );
    assert.equal(replay.status, "replayed");
    assert.equal(calls, 0);
  });

  it("U4 — une annulation confirmée reste réessayable explicitement (retryTerminal), pas automatiquement", async () => {
    const store = createInMemoryDurableExecutionStore();
    await runDurableLoopExecution(store, request("worker-a"), async () =>
      cancelled(EXECUTION_CANCELLED_CODE),
    );
    let calls = 0;
    const withoutFlag = await runDurableLoopExecution(
      store,
      request("worker-b"),
      async () => {
        calls += 1;
        return completedResult();
      },
    );
    assert.equal(withoutFlag.status, "replayed");
    assert.equal(calls, 0);
    const explicit = await runDurableLoopExecution(
      store,
      request("worker-b", true),
      async () => {
        calls += 1;
        return completedResult();
      },
    );
    assert.equal(explicit.status, "executed");
    assert.equal(calls, 1);
  });

  it("U5 — la reprise de bail ne ressuscite jamais un enregistrement cancelled", async () => {
    const store = createInMemoryDurableExecutionStore();
    await runDurableLoopExecution(store, request("worker-a"), async () =>
      cancelled(CANCELLATION_CLEANUP_FAILED_CODE),
    );
    const recovery = await recoverDurableExecution(store, {
      idempotencyKey: "idem-cleanup-uncertain",
      owner: "worker-b",
      leaseDurationMs: 60_000,
    });
    assert.equal(recovery.status, "terminal");
  });

  it("U6 — le rapport JSON de la voie durable ne masque pas l'arrêt incertain", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-cleanup-uncertain-"));
    try {
      const application = {
        async runLoopPublish() {
          return cancelled(CANCELLATION_CLEANUP_FAILED_CODE);
        },
        recordLoopRunHistory() {
          return Object.freeze({ written: true, ok: true });
        },
      };
      const result = await runDurableAutoSubscriptionPublish(
        application as never,
        {
          project: "example",
          candidateId: "H1-L1",
          expectedGitHead: "a".repeat(40),
          maxRepairs: 0,
          storeDirectory: root,
        },
      );
      assert.equal(result.report.status, "cancelled");
      assert.equal(result.exitCode, 1);
      assert.equal(
        result.report.cancellationCleanup,
        "unconfirmed",
        "le rapport doit distinguer un arrêt incertain d'une annulation confirmée",
      );
      assert.equal(
        JSON.stringify(result.report).includes(root),
        false,
        "aucun chemin local dans le rapport",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("U7 — le rapport d'une annulation confirmée ne porte pas de code d'échec de nettoyage", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-cleanup-confirmed-"));
    try {
      const application = {
        async runLoopPublish() {
          return cancelled(EXECUTION_CANCELLED_CODE);
        },
        recordLoopRunHistory() {
          return Object.freeze({ written: true, ok: true });
        },
      };
      const result = await runDurableAutoSubscriptionPublish(
        application as never,
        {
          project: "example",
          candidateId: "H1-L2",
          expectedGitHead: "a".repeat(40),
          maxRepairs: 0,
          storeDirectory: root,
        },
      );
      assert.equal(result.report.status, "cancelled");
      assert.equal(result.report.cancellationCleanup, undefined);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("U8 — le rapport d'un nouvel essai refusé sur un arrêt incertain porte aussi la marque et ne démarre rien", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-cleanup-retry-"));
    try {
      let publishCalls = 0;
      const application = {
        async runLoopPublish() {
          publishCalls += 1;
          return cancelled(CANCELLATION_CLEANUP_FAILED_CODE);
        },
        recordLoopRunHistory() {
          return Object.freeze({ written: true, ok: true });
        },
      };
      const input = {
        project: "example",
        candidateId: "H1-L3",
        expectedGitHead: "a".repeat(40),
        maxRepairs: 0,
        storeDirectory: root,
      };
      await runDurableAutoSubscriptionPublish(application as never, input);
      const retry = await runDurableAutoSubscriptionPublish(
        application as never,
        {
          ...input,
          retryTerminal: true,
          owner: "worker-retry",
        },
      );
      assert.equal(publishCalls, 1, "aucune seconde exécution");
      assert.equal(retry.report.status, "in_progress");
      assert.equal(retry.report.rejectionCode, "execution_in_progress");
      assert.equal(retry.report.cancellationCleanup, "unconfirmed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  for (const code of [
    CANCELLATION_CLEANUP_FAILED_CODE,
    EXECUTION_CANCELLED_CODE,
  ]) {
    it(`U9 — magasin fichier : un enregistrement cancelled (${code}) reste lisible, listable et vérifiable`, async () => {
      const root = mkdtempSync(join(tmpdir(), "loop-cancelled-readable-"));
      try {
        const store = createFileDurableExecutionStore({ directory: root });
        const outcome = await runDurableLoopExecution(
          store,
          request("worker-a"),
          async () => cancelled(code),
        );
        assert.equal(outcome.status, "executed");
        // Le contrat de l'enveloppe durable exige result = null pour cancelled :
        // un enregistrement refusé à la relecture rendrait load/list/statut inutilisables.
        const loaded = await store.load("idem-cleanup-uncertain");
        assert.equal(loaded?.status, "cancelled");
        assert.equal(loaded?.failure?.code, code);
        assert.equal(await store.verify("idem-cleanup-uncertain"), true);
        assert.equal((await store.list()).length, 1);
        const read = await readFileDurableExecutionRecords(root);
        assert.equal(read.length, 1);
        assert.equal(read[0]?.failure?.code, code);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
