import { createCodexCliLoopExecutor } from "../loop/codex-cli-executor.js";

export type CodexProviderCompositionOptions = Readonly<{
  executable: string;
  model?: string;
  timeoutMs?: number;
}>;

export function composeCodexProvider(options: CodexProviderCompositionOptions) {
  return createCodexCliLoopExecutor({
    executable: options.executable,
    ...(options.model ? { model: options.model } : {}),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });
}
