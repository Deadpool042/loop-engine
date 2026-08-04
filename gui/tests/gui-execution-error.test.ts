import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  encodeGuiExecutionError,
  decodeGuiExecutionError,
  toGuiExecutionError,
} from "../shared/gui-execution-error.js";

describe("gui-execution-error", () => {
  it("round-trips a process_start_failed error through encode/decode", () => {
    const error = {
      kind: "process_start_failed" as const,
      message: "Impossible de démarrer la commande.",
      details: "ENOENT: no such file or directory",
    };

    const decoded = decodeGuiExecutionError(encodeGuiExecutionError(error));

    assert.deepEqual(decoded, error);
  });

  it("round-trips a process_exit_failed error, preserving exitCode", () => {
    const error = {
      kind: "process_exit_failed" as const,
      message: "La commande a échoué.",
      details: "unknown project",
      exitCode: 1,
    };

    const decoded = decodeGuiExecutionError(encodeGuiExecutionError(error));

    assert.deepEqual(decoded, error);
  });

  it("round-trips an invalid_output error", () => {
    const error = {
      kind: "invalid_output" as const,
      message: "Sortie invalide.",
      details: "Loop CLI context returned invalid JSON",
    };

    const decoded = decodeGuiExecutionError(encodeGuiExecutionError(error));

    assert.deepEqual(decoded, error);
  });

  it("returns null for a message with no embedded marker", () => {
    assert.equal(decodeGuiExecutionError("plain error message"), null);
  });

  it("returns null for a malformed embedded payload", () => {
    assert.equal(
      decodeGuiExecutionError("GUI_EXECUTION_ERROR::not-json"),
      null,
    );
  });

  it("toGuiExecutionError recovers the structured error from an Error carrying an encoded message", () => {
    const error = {
      kind: "process_exit_failed" as const,
      message: "échec",
      details: "stderr text",
      exitCode: 2,
    };

    const wrapped = new Error(encodeGuiExecutionError(error));

    assert.deepEqual(toGuiExecutionError(wrapped), error);
  });

  it("toGuiExecutionError never exposes a raw system error object — always a plain, typed value", () => {
    const nativeError = new Error("ENOENT: no such file or directory, spawn tsx");

    const result = toGuiExecutionError(nativeError);

    assert.equal(result.kind, "invalid_output");
    assert.equal(result.details, nativeError.message);
    assert.equal(typeof result.message, "string");
    // never the Error instance itself, never a raw object with extra fields
    assert.equal(Object.keys(result).sort().join(","), "details,kind,message");
  });

  it("toGuiExecutionError wraps a non-Error thrown value without crashing", () => {
    const result = toGuiExecutionError("boom");

    assert.equal(result.kind, "invalid_output");
    assert.equal(result.details, "boom");
  });
});
