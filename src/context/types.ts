import type { ContextBudget } from "../policy/types.js";

export type ContextSourceKind = "required_doc" | "roadmap";

export type ContextSource = Readonly<{
  path: string;
  kind: ContextSourceKind;
  priority: number;
}>;

export type ContextFile = Readonly<{
  path: string;
  kind: ContextSourceKind;
  content: string;
  originalCharacters: number;
  includedCharacters: number;
  estimatedTokens: number;
  truncated: boolean;
}>;

export type ContextOmissionReason =
  | "duplicate"
  | "missing"
  | "outside_project"
  | "file_limit"
  | "character_limit"
  | "token_limit";

export type ContextOmission = Readonly<{
  path: string;
  reason: ContextOmissionReason;
}>;

export type MinimalContextPackage = Readonly<{
  project: string;
  budget: ContextBudget;
  files: readonly ContextFile[];
  omitted: readonly ContextOmission[];
  totalCharacters: number;
  estimatedTokens: number;
  truncated: boolean;
}>;
