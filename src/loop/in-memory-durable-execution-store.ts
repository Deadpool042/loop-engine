import type {
  DurableExecutionRecord,
  DurableExecutionStore,
} from "./durable-execution.js";

function clone(record: DurableExecutionRecord): DurableExecutionRecord {
  return Object.freeze({
    ...record,
    events: Object.freeze([...record.events]),
  });
}

/**
 * Deterministic process-local adapter for tests, embedded applications and
 * supervisors that own persistence outside Loop Engine.
 */
export function createInMemoryDurableExecutionStore(
  initial: readonly DurableExecutionRecord[] = [],
): DurableExecutionStore & Readonly<{ records(): readonly DurableExecutionRecord[] }> {
  const records = new Map<string, DurableExecutionRecord>();
  for (const record of initial) {
    if (records.has(record.idempotencyKey)) {
      throw new Error(`Duplicate durable execution key: ${record.idempotencyKey}`);
    }
    records.set(record.idempotencyKey, clone(record));
  }

  return Object.freeze({
    async load(idempotencyKey) {
      const record = records.get(idempotencyKey);
      return record === undefined ? null : clone(record);
    },
    async save(record, expectedRevision) {
      const current = records.get(record.idempotencyKey);
      const currentRevision = current?.revision ?? null;
      if (currentRevision !== expectedRevision) return false;
      records.set(record.idempotencyKey, clone(record));
      return true;
    },
    records() {
      return Object.freeze(
        [...records.values()]
          .sort((left, right) => left.idempotencyKey.localeCompare(right.idempotencyKey))
          .map(clone),
      );
    },
  });
}
