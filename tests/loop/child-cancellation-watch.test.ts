import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type ProcessTerminationOutcome,
  watchChildForCancellation,
} from "../../src/loop/process-termination.js";

// Observation de la terminaison d'un groupe de processus sur une annulation,
// avec dépendances injectées : aucun vrai processus, aucun signal envoyé.
// Ce que l'environnement ne permet pas de vérifier ici : le comportement d'un
// vrai groupe qui survit à SIGKILL (état « uninterruptible », EPERM) ; il n'est
// pas reproductible sans laisser volontairement un processus actif.

function fakeGroup(dieOn: NodeJS.Signals | null) {
  const sent: NodeJS.Signals[] = [];
  let alive = true;
  return {
    sent,
    deps: {
      killGraceMs: 25,
      confirmMs: 25,
      signalGroup(_pgid: number, signal: NodeJS.Signals): boolean {
        sent.push(signal);
        if (signal === dieOn) alive = false;
        return true;
      },
      isGroupAlive: (): boolean => alive,
      sleep: async (): Promise<void> => {
        await new Promise((resolve) => setTimeout(resolve, 2));
      },
    },
  };
}

const child = { pid: 4242, kill: () => true };

function outcomes(): {
  list: ProcessTerminationOutcome[];
  push: (o: ProcessTerminationOutcome) => void;
} {
  const list: ProcessTerminationOutcome[] = [];
  return { list, push: (o) => void list.push(o) };
}

async function until(condition: () => boolean, ms = 3_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error("condition non atteinte");
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

describe("watchChildForCancellation — groupe de processus (L7)", () => {
  it("W1 — un groupe qui survit à SIGKILL est rapporté cleanup_failed, une seule fois, après une attente bornée", async () => {
    const group = fakeGroup(null);
    const seen = outcomes();
    const controller = new AbortController();
    const watch = watchChildForCancellation(
      child,
      controller.signal,
      true,
      seen.push,
      group.deps,
    );
    const started = Date.now();
    controller.abort();
    assert.equal(watch.isCancelling(), true);
    assert.deepEqual(
      seen.list,
      [],
      "rien n'est déclaré terminé avant la preuve",
    );
    await until(() => seen.list.length > 0);
    assert.deepEqual(seen.list, ["cleanup_failed"]);
    assert.deepEqual(group.sent, ["SIGTERM", "SIGKILL"]);
    assert.ok(
      Date.now() - started < 2_000,
      "attente bornée, pas de boucle infinie",
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.deepEqual(seen.list, ["cleanup_failed"], "un seul rapport");
    watch.dispose();
  });

  it("W2 — un groupe qui meurt sur SIGTERM est rapporté terminated sans SIGKILL", async () => {
    const group = fakeGroup("SIGTERM");
    const seen = outcomes();
    const controller = new AbortController();
    watchChildForCancellation(
      child,
      controller.signal,
      true,
      seen.push,
      group.deps,
    );
    controller.abort();
    await until(() => seen.list.length > 0);
    assert.deepEqual(seen.list, ["terminated"]);
    assert.deepEqual(group.sent, ["SIGTERM"]);
  });

  it("W3 — un groupe qui ignore SIGTERM mais meurt sur SIGKILL est rapporté terminated après escalade", async () => {
    const group = fakeGroup("SIGKILL");
    const seen = outcomes();
    const controller = new AbortController();
    watchChildForCancellation(
      child,
      controller.signal,
      true,
      seen.push,
      group.deps,
    );
    controller.abort();
    await until(() => seen.list.length > 0);
    assert.deepEqual(seen.list, ["terminated"]);
    assert.deepEqual(group.sent, ["SIGTERM", "SIGKILL"]);
  });

  it("W4 — un signal déjà annulé déclenche la terminaison dès la surveillance, une seule fois", async () => {
    const group = fakeGroup("SIGTERM");
    const seen = outcomes();
    const controller = new AbortController();
    controller.abort();
    const watch = watchChildForCancellation(
      child,
      controller.signal,
      true,
      seen.push,
      group.deps,
    );
    assert.equal(watch.isCancelling(), true);
    await until(() => seen.list.length > 0);
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.deepEqual(seen.list, ["terminated"]);
    assert.deepEqual(group.sent, ["SIGTERM"]);
  });

  it("W5 — après dispose(), une annulation ne signale plus rien et ne rapporte rien", async () => {
    const group = fakeGroup("SIGTERM");
    const seen = outcomes();
    const controller = new AbortController();
    const watch = watchChildForCancellation(
      child,
      controller.signal,
      true,
      seen.push,
      group.deps,
    );
    watch.dispose();
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.deepEqual(seen.list, []);
    assert.deepEqual(group.sent, []);
    assert.equal(watch.isCancelling(), false);
  });

  it("W6 — un identifiant de groupe invalide n'envoie aucun signal et n'est jamais déclaré terminé", async () => {
    for (const pid of [0, 1, -5, 1.5]) {
      const group = fakeGroup("SIGTERM");
      const seen = outcomes();
      const controller = new AbortController();
      watchChildForCancellation(
        { pid, kill: () => true },
        controller.signal,
        true,
        seen.push,
        group.deps,
      );
      controller.abort();
      await until(() => seen.list.length > 0);
      assert.deepEqual(seen.list, ["cleanup_failed"], `pid ${pid}`);
      assert.deepEqual(group.sent, [], `pid ${pid}`);
    }
  });
});
