import type { AuthorityLifecycleError, AuthorityLifecycleErrorCode, AuthorityLifecycleValidation } from "./types.js";
import { freezeAuthorityLifecycleValue } from "./support.js";
export function authorityLifecycleError(code: AuthorityLifecycleErrorCode, message: string): AuthorityLifecycleError { return freezeAuthorityLifecycleValue({ code, message, details: freezeAuthorityLifecycleValue({ domain: "authority_lifecycle" }), executionAllowed: false, executionStarted: false }); }
export function lifecycleValidation(diagnostics: readonly AuthorityLifecycleError[]): AuthorityLifecycleValidation { return freezeAuthorityLifecycleValue({ valid: diagnostics.length === 0, diagnostics: freezeAuthorityLifecycleValue([...diagnostics]) }); }
