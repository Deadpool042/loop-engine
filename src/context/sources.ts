import type { ProjectSnapshot } from "../intelligence/snapshot.js";
import type { ContextSource } from "./types.js";

export function collectContextSources(snapshot: ProjectSnapshot): readonly ContextSource[] {
  const sources: ContextSource[] = [];
  const seen = new Set<string>();

  const addSource = (path: string, kind: ContextSource["kind"], priority: number): void => {
    if (seen.has(path)) {
      return;
    }

    seen.add(path);
    sources.push({ path, kind, priority });
  };

  snapshot.docs.required.forEach((path, index) => {
    addSource(path, "required_doc", index);
  });

  snapshot.roadmap.paths.forEach((path, index) => {
    addSource(path, "roadmap", snapshot.docs.required.length + index);
  });

  return sources.sort((left, right) => left.priority - right.priority || left.path.localeCompare(right.path));
}
