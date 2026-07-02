import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { type ProjectConfig } from "../core/config.js";

export function validateProject(project: ProjectConfig): void {
  const projectPath = resolve(project.path);

  if (project.validation.length === 0) {
    console.log(`No validation command configured for ${project.name}.`);
    return;
  }

  for (const command of project.validation) {
    console.log(`\nRunning in ${project.name}: ${command}`);

    const result = spawnSync(command, {
      cwd: projectPath,
      shell: true,
      stdio: "inherit",
    });

    if (result.status !== 0) {
      console.error(`\nValidation failed: ${command}`);
      process.exit(result.status ?? 1);
    }
  }

  console.log(`\nValidation passed for ${project.name}.`);
}
