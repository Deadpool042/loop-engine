import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import YAML from "yaml";

type ProjectConfig = {
  name: string;
  path: string;
  type: string;
  required_docs: string[];
  validation: string[];
};

type Config = {
  projects: ProjectConfig[];
};

function run(command: string, cwd: string): string {
  try {
    return execSync(command, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function loadConfig(): Config {
  const raw = readFileSync("projects.yaml", "utf8");
  return YAML.parse(raw) as Config;
}

function status(): void {
  const config = loadConfig();

  for (const project of config.projects) {
    const projectPath = resolve(project.path);
    const branch = run("git branch --show-current", projectPath);
    const gitStatus = run("git status --short", projectPath);
    const state = gitStatus.length === 0 ? "clean" : "dirty";

    console.log(`\n${project.name}`);
    console.log(`Path: ${projectPath}`);
    console.log(`Type: ${project.type}`);
    console.log(`Git: ${branch} / ${state}`);

    console.log("Docs:");
    for (const doc of project.required_docs) {
      const exists = existsSync(resolve(projectPath, doc));
      console.log(`- ${exists ? "OK" : "MISSING"} ${doc}`);
    }

    console.log("Validation:");
    if (project.validation.length === 0) {
      console.log("- none");
    } else {
      for (const command of project.validation) {
        console.log(`- ${command}`);
      }
    }
  }
}


function doctor(): void {
  const config = loadConfig();
  let hasError = false;

  for (const project of config.projects) {
    const projectPath = resolve(project.path);
    const projectExists = existsSync(projectPath);
    const gitDirExists = existsSync(resolve(projectPath, ".git"));

    console.log(`\n${project.name}`);
    console.log(`Path: ${projectPath}`);

    if (!projectExists) {
      hasError = true;
      console.log("- ERROR project path does not exist");
      continue;
    }

    if (!gitDirExists) {
      hasError = true;
      console.log("- ERROR project is not a Git repository");
    } else {
      console.log("- OK Git repository detected");
    }

    for (const doc of project.required_docs) {
      const exists = existsSync(resolve(projectPath, doc));
      if (!exists) {
        hasError = true;
      }
      console.log(`- ${exists ? "OK" : "MISSING"} ${doc}`);
    }

    if (project.validation.length === 0) {
      console.log("- INFO no validation command configured");
    } else {
      console.log(`- OK ${project.validation.length} validation command(s) configured`);
    }
  }

  if (hasError) {
    process.exitCode = 1;
  }
}

const command = process.argv[2];

if (command === "status") {
  status();
} else if (command === "doctor") {
  doctor();
} else {
  console.error("Usage: pnpm loop status|doctor");
  process.exit(1);
}
