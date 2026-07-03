export type ProjectHealth = "good" | "warning" | "error";

export type ProjectSnapshot = Readonly<{
  project: Readonly<{
    name: string;
    type: string;
    path: string;
  }>;

  git: Readonly<{
    branch: string;
    clean: boolean;
    requiresGit: boolean;
    statusText: string;
    lastCommit: Readonly<{
      hash: string;
      message: string;
    }> | null;
  }>;

  docs: Readonly<{
    required: readonly string[];
    missing: readonly string[];
  }>;

  validation: Readonly<{
    commands: readonly string[];
    configured: boolean;
  }>;

  health: ProjectHealth;
}>;
