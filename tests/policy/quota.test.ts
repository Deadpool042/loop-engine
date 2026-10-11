import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyQuotaReserve,
  evaluateQuotaReservePolicy,
} from "../../src/policy/quota.js";

describe("quota reserve policy", () => {
  it("uses the default 10/5/5 reserve and exposes 20 percent total", () => {
    assert.deepEqual(evaluateQuotaReservePolicy(), {
      repairPercent: 10,
      ciPercent: 5,
      emergencyPercent: 5,
      totalPercent: 20,
    });
  });

  it("accepts a custom reserve without mutating native remaining quota", () => {
    assert.deepEqual(
      applyQuotaReserve(42, {
        repairPercent: 8,
        ciPercent: 4,
        emergencyPercent: 3,
      }),
      {
        remainingPercent: 42,
        reserve: {
          repairPercent: 8,
          ciPercent: 4,
          emergencyPercent: 3,
          totalPercent: 15,
        },
        usablePercent: 27,
        reserveBinding: true,
      },
    );
  });

  it("never exposes negative usable quota when the reserve exceeds remaining capacity", () => {
    assert.equal(applyQuotaReserve(12).usablePercent, 0);
  });

  it("fails closed when a reserve component or total is invalid", () => {
    assert.throws(
      () =>
        evaluateQuotaReservePolicy({
          repairPercent: -1,
          ciPercent: 5,
          emergencyPercent: 5,
        }),
      /Invalid quota reserve percentage/,
    );
    assert.throws(
      () =>
        evaluateQuotaReservePolicy({
          repairPercent: 60,
          ciPercent: 30,
          emergencyPercent: 20,
        }),
      /exceeds 100 percent/,
    );
  });
});
