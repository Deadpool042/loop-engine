// Real filesystem-backed PathMarkerCheck. A single non-recursive stat per
// candidate marker — see repo-path-detector.ts for the bounded candidate
// list this is applied against.
import { access } from "node:fs/promises";
import type { PathMarkerCheck } from "./repo-path-detector.js";

export class FsPathMarkerCheck implements PathMarkerCheck {
  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
