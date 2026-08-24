import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

test("gui:start raises and preserves its NOFILE limit for the direct Forge child", (t) => {
  const script = readFileSync(resolve("scripts/gui-start.sh"), "utf8");
  assert.match(script, /target_limit=8192/);
  assert.match(script, /ulimit -Sn/);
  assert.match(script, /ulimit -Hn/);
  assert.match(script, /ulimit -n "\$target_limit"/);
  assert.match(script, /server\.listen\(0, "127\.0\.0\.1"/);
  assert.match(script, /export PORT/);
  assert.match(script, /exec \.\/node_modules\/\.bin\/electron-forge start "\$@"/);
  assert.doesNotMatch(script, /sudo|launchctl|kill -9/);

  const fixtureRoot = mkdtempSync(join(tmpdir(), "loop-engine-gui-start-"));
  t.after(() => {
    execFileSync("rm", ["-rf", fixtureRoot]);
  });

  mkdirSync(join(fixtureRoot, "scripts"), { recursive: true });
  mkdirSync(join(fixtureRoot, "node_modules", ".bin"), { recursive: true });
  cpSync(resolve("scripts/gui-start.sh"), join(fixtureRoot, "scripts", "gui-start.sh"));

  const childReport = join(fixtureRoot, "child-report.txt");
  const parentReport = join(fixtureRoot, "parent-report.txt");
  const forgeFixture = join(fixtureRoot, "node_modules", ".bin", "electron-forge");
  writeFileSync(
    forgeFixture,
    `#!/usr/bin/env bash\nprintf '%s %s\\n' "$(ulimit -Sn)" "$PPID" > "${childReport}"\n`,
  );
  chmodSync(forgeFixture, 0o755);

  execFileSync(
    "bash",
    ["-c", `ulimit -S -n 8192; ulimit -H -n 8192; ulimit -S -n 256; ulimit -Sn > "${parentReport}"; exec bash scripts/gui-start.sh`],
    { cwd: fixtureRoot },
  );

  const [childSoftLimit, childParentPid] = readFileSync(childReport, "utf8").trim().split(" ");
  assert.equal(readFileSync(parentReport, "utf8").trim(), "256", "fixture must start below the target limit");
  assert.ok(Number(childSoftLimit) >= 8192, `expected child NOFILE >= 8192, got ${childSoftLimit}`);
  assert.equal(Number(childParentPid), process.pid, "Forge fixture must replace the starter directly");
});
