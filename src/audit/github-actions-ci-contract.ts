export type GithubActionsCiContractReport = Readonly<{
  missing: readonly string[];
}>;

export const GITHUB_ACTIONS_PARALLEL_CI_CONTRACT = Object.freeze({
  requiredPatterns: Object.freeze([
    /uses:\s*actions\/checkout@v\d+/,
    /uses:\s*pnpm\/action-setup@v\d+/,
    /uses:\s*actions\/setup-node@v\d+/,
    /run:\s*pnpm install --frozen-lockfile/,
    /\bquality:/,
    /\btypecheck:/,
    /\btests:/,
    /\baudit-strict:/,
    /\baudit-profiles:/,
    /\bci-gate:/,
    /needs:[\s\S]*- quality[\s\S]*- typecheck[\s\S]*- tests[\s\S]*- audit-strict[\s\S]*- audit-profiles/,
    /QUALITY:\s*\$\{\{ needs\.quality\.result \}\}/,
    /TYPECHECK:\s*\$\{\{ needs\.typecheck\.result \}\}/,
    /TESTS:\s*\$\{\{ needs\.tests\.result \}\}/,
    /AUDIT_STRICT:\s*\$\{\{ needs\.audit-strict\.result \}\}/,
    /AUDIT_PROFILES:\s*\$\{\{ needs\.audit-profiles\.result \}\}/,
    /if \[\[ "\$result" != "success" \]\]; then/,
  ]),
});

export function inspectGithubActionsCiContract(
  source: string,
): GithubActionsCiContractReport {
  const missing = GITHUB_ACTIONS_PARALLEL_CI_CONTRACT.requiredPatterns
    .filter((pattern) => !pattern.test(source))
    .map((pattern) => pattern.source);

  return Object.freeze({ missing: Object.freeze(missing) });
}
