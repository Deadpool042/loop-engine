// Resolves a project's absolute path via the existing, already-trusted
// context client (never from renderer-supplied input) and hands it to an
// injected folder opener. The renderer only ever sends a project name.
import type { LoopCliContextClient } from "./cli-context-client.js";

export interface FolderOpener {
  openPath(path: string): Promise<string>;
}

export interface LoopCliOpenFolderClient {
  openProjectFolder(repoPath: string, projectName: string): Promise<void>;
}

export class DefaultLoopCliOpenFolderClient implements LoopCliOpenFolderClient {
  constructor(
    private readonly contextClient: LoopCliContextClient,
    private readonly opener: FolderOpener,
  ) {}

  async openProjectFolder(repoPath: string, projectName: string): Promise<void> {
    const report = await this.contextClient.loadProjectContext(
      repoPath,
      projectName,
    );

    const errorMessage = await this.opener.openPath(report.project.path);

    if (errorMessage) {
      throw new Error(errorMessage);
    }
  }
}
