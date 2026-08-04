export type ProcessRequest = Readonly<{
  executable: string;
  args: readonly string[];
  cwd: string;
}>;

export type ProcessResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export interface ProcessRunner {
  run(request: ProcessRequest): Promise<ProcessResult>;
}
