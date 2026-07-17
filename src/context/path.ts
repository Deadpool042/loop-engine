import { relative, resolve } from "node:path";

export type ResolvedContextPath = Readonly<{
  absolutePath: string;
  insideProject: boolean;
}>;

export function resolveContextPath(
  projectPath: string,
  sourcePath: string,
): ResolvedContextPath {
  const projectRoot = resolve(projectPath);
  const absolutePath = resolve(projectRoot, sourcePath);
  const relativePath = relative(projectRoot, absolutePath);

  const insideProject =
    relativePath === "" ||
    (!relativePath.startsWith("..") && !relativePath.startsWith("/"));

  return {
    absolutePath,
    insideProject,
  };
}
