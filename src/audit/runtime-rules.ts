import { createAuditRuleRegistry } from "./registry.js";
import { RUNTIME_EXECUTION_PUBLIC_RESULT_FACADE_RULE } from "./rules/runtime-execution-public-result-facade.js";
import { RUNTIME_EXECUTION_RECEIPT_REPORTING_RULE } from "./rules/runtime-execution-receipt-reporting.js";
import { RUNTIME_EXECUTION_RECEIPT_REPORTING_SERIALIZATION_RULE } from "./rules/runtime-execution-receipt-reporting-serialization.js";
import { RUNTIME_RULE_INVENTORY_NORMALIZATION_RULE } from "./rules/runtime-rule-inventory-normalization.js";
import {
  RUNTIME_AUDIT_MANIFEST_CONSISTENCY_RULE,
  registerRuntimeAuditManifestInventory,
} from "./rules/runtime-audit-manifest-consistency.js";
import { INBOUND_SECURITY_CONTRACT_RULE } from "./rules/inbound-security-contract.js";
import { INBOUND_SECURITY_GATE_RULE } from "./rules/inbound-security-gate.js";
import { INBOUND_AUTHENTICATION_VERIFICATION_RULE } from "./rules/inbound-authentication-verification.js";
import { INBOUND_AUTHENTICATION_GATE_RULE } from "./rules/inbound-authentication-gate.js";
import { INBOUND_REQUEST_HANDLER_NEUTRALITY_RULE } from "./rules/inbound-request-handler-neutrality.js";
import { INBOUND_REQUEST_HANDLER_GATE_RULE } from "./rules/inbound-request-handler-gate.js";
import { INBOUND_TRANSPORT_ADAPTER_NEUTRALITY_RULE } from "./rules/inbound-transport-adapter-neutrality.js";
import { INBOUND_TRANSPORT_ADAPTER_GATE_RULE } from "./rules/inbound-transport-adapter-gate.js";
import { INBOUND_REPLAY_PROTECTION_NEUTRALITY_RULE } from "./rules/inbound-replay-protection-neutrality.js";
import { INBOUND_REPLAY_PROTECTION_GATE_RULE } from "./rules/inbound-replay-protection-gate.js";
import { INBOUND_REPLAY_PROTECTED_AUTHENTICATION_NEUTRALITY_RULE } from "./rules/inbound-replay-protected-authentication-neutrality.js";
import { INBOUND_REPLAY_PROTECTED_AUTHENTICATION_GATE_RULE } from "./rules/inbound-replay-protected-authentication-gate.js";
import { INBOUND_EVALUATION_TIME_COHERENCE_RULE } from "./rules/inbound-evaluation-time-coherence.js";
import { INBOUND_EVALUATION_TIME_COHERENCE_GATE_RULE } from "./rules/inbound-evaluation-time-coherence-gate.js";
import { INBOUND_REPLAY_EVIDENCE_BINDING_RULE } from "./rules/inbound-replay-evidence-binding.js";
import { INBOUND_REPLAY_EVIDENCE_BINDING_GATE_RULE } from "./rules/inbound-replay-evidence-binding-gate.js";
import { INBOUND_PRINCIPAL_BINDING_RULE } from "./rules/inbound-principal-binding.js";
import { INBOUND_PRINCIPAL_BINDING_GATE_RULE } from "./rules/inbound-principal-binding-gate.js";
import { INBOUND_PRINCIPAL_PRESENCE_RULE } from "./rules/inbound-principal-presence.js";
import { INBOUND_PRINCIPAL_PRESENCE_GATE_RULE } from "./rules/inbound-principal-presence-gate.js";
import { INBOUND_AUTH_EVIDENCE_VALIDITY_RULE } from "./rules/inbound-auth-evidence-validity.js";
import { INBOUND_AUTH_EVIDENCE_VALIDITY_GATE_RULE } from "./rules/inbound-auth-evidence-validity-gate.js";
import { INBOUND_TENANT_BINDING_RULE } from "./rules/inbound-tenant-binding.js";
import { INBOUND_TENANT_BINDING_GATE_RULE } from "./rules/inbound-tenant-binding-gate.js";
import { INBOUND_OPERATION_BINDING_RULE } from "./rules/inbound-operation-binding.js";
import { INBOUND_OPERATION_BINDING_GATE_RULE } from "./rules/inbound-operation-binding-gate.js";
import { INBOUND_OPERATION_POLICY_ADMISSION_RULE } from "./rules/inbound-operation-policy-admission.js";
import { INBOUND_OPERATION_POLICY_ADMISSION_GATE_RULE } from "./rules/inbound-operation-policy-admission-gate.js";
import { INBOUND_REPLAY_REQUEST_BINDING_RULE } from "./rules/inbound-replay-request-binding.js";
import { INBOUND_REPLAY_REQUEST_BINDING_GATE_RULE } from "./rules/inbound-replay-request-binding-gate.js";
import { INBOUND_REPLAY_STATE_REJECTION_RULE } from "./rules/inbound-replay-state-rejection.js";
import { INBOUND_REPLAY_STATE_REJECTION_GATE_RULE } from "./rules/inbound-replay-state-rejection-gate.js";
import { INBOUND_PROJECT_BINDING_RULE } from "./rules/inbound-project-binding.js";
import { INBOUND_PROJECT_BINDING_GATE_RULE } from "./rules/inbound-project-binding-gate.js";
import { INBOUND_REPLAY_RECEIPT_TIME_VALIDATION_RULE } from "./rules/inbound-replay-receipt-time-validation.js";
import { INBOUND_REPLAY_RECEIPT_TIME_VALIDATION_GATE_RULE } from "./rules/inbound-replay-receipt-time-validation-gate.js";
import { INBOUND_REPLAY_PORT_RECEIPT_TIME_VALIDATION_RULE } from "./rules/inbound-replay-port-receipt-time-validation.js";
import { INBOUND_REPLAY_PORT_RECEIPT_TIME_VALIDATION_GATE_RULE } from "./rules/inbound-replay-port-receipt-time-validation-gate.js";
import { INBOUND_VERIFICATION_REQUEST_BINDING_RULE } from "./rules/inbound-verification-request-binding.js";
import { INBOUND_VERIFICATION_REQUEST_BINDING_GATE_RULE } from "./rules/inbound-verification-request-binding-gate.js";
import { INBOUND_VERIFICATION_EVALUATION_TIME_BINDING_RULE } from "./rules/inbound-verification-evaluation-time-binding.js";
import { INBOUND_VERIFICATION_EVALUATION_TIME_BINDING_GATE_RULE } from "./rules/inbound-verification-evaluation-time-binding-gate.js";
import { INBOUND_REPLAY_NONCE_VALIDATION_RULE } from "./rules/inbound-replay-nonce-validation.js";
import { INBOUND_REPLAY_NONCE_VALIDATION_GATE_RULE } from "./rules/inbound-replay-nonce-validation-gate.js";
import { registerAuditRulesForIntegrityCheck } from "./rules/audit.js";
import { AUDIT_RULES as BASE_AUDIT_RULES } from "./rules.js";

/**
 * Operational audit inventory.
 *
 * V13.76+ keeps the historical rules module stable while extending the runtime
 * audit inventory with additive Runtime receipt/public-result boundary rules.
 * The composite inventory is normalized again so downstream selectors and
 * manifests always receive complete AuditRule metadata.
 */
export const AUDIT_RULES = createAuditRuleRegistry([
  ...BASE_AUDIT_RULES,
  RUNTIME_EXECUTION_RECEIPT_REPORTING_RULE,
  RUNTIME_EXECUTION_RECEIPT_REPORTING_SERIALIZATION_RULE,
  RUNTIME_EXECUTION_PUBLIC_RESULT_FACADE_RULE,
  RUNTIME_RULE_INVENTORY_NORMALIZATION_RULE,
  RUNTIME_AUDIT_MANIFEST_CONSISTENCY_RULE,
  INBOUND_SECURITY_CONTRACT_RULE,
  INBOUND_SECURITY_GATE_RULE,
  INBOUND_AUTHENTICATION_VERIFICATION_RULE,
  INBOUND_AUTHENTICATION_GATE_RULE,
  INBOUND_REQUEST_HANDLER_NEUTRALITY_RULE,
  INBOUND_REQUEST_HANDLER_GATE_RULE,
  INBOUND_TRANSPORT_ADAPTER_NEUTRALITY_RULE,
  INBOUND_TRANSPORT_ADAPTER_GATE_RULE,
  INBOUND_REPLAY_PROTECTION_NEUTRALITY_RULE,
  INBOUND_REPLAY_PROTECTION_GATE_RULE,
  INBOUND_REPLAY_PROTECTED_AUTHENTICATION_NEUTRALITY_RULE,
  INBOUND_REPLAY_PROTECTED_AUTHENTICATION_GATE_RULE,
  INBOUND_EVALUATION_TIME_COHERENCE_RULE,
  INBOUND_EVALUATION_TIME_COHERENCE_GATE_RULE,
  INBOUND_REPLAY_EVIDENCE_BINDING_RULE,
  INBOUND_REPLAY_EVIDENCE_BINDING_GATE_RULE,
  INBOUND_PRINCIPAL_BINDING_RULE,
  INBOUND_PRINCIPAL_BINDING_GATE_RULE,
  INBOUND_PRINCIPAL_PRESENCE_RULE,
  INBOUND_PRINCIPAL_PRESENCE_GATE_RULE,
  INBOUND_AUTH_EVIDENCE_VALIDITY_RULE,
  INBOUND_AUTH_EVIDENCE_VALIDITY_GATE_RULE,
  INBOUND_TENANT_BINDING_RULE,
  INBOUND_TENANT_BINDING_GATE_RULE,
  INBOUND_OPERATION_BINDING_RULE,
  INBOUND_OPERATION_BINDING_GATE_RULE,
  INBOUND_OPERATION_POLICY_ADMISSION_RULE,
  INBOUND_OPERATION_POLICY_ADMISSION_GATE_RULE,
  INBOUND_REPLAY_REQUEST_BINDING_RULE,
  INBOUND_REPLAY_REQUEST_BINDING_GATE_RULE,
  INBOUND_REPLAY_STATE_REJECTION_RULE,
  INBOUND_REPLAY_STATE_REJECTION_GATE_RULE,
  INBOUND_PROJECT_BINDING_RULE,
  INBOUND_PROJECT_BINDING_GATE_RULE,
  INBOUND_REPLAY_RECEIPT_TIME_VALIDATION_RULE,
  INBOUND_REPLAY_RECEIPT_TIME_VALIDATION_GATE_RULE,
  INBOUND_REPLAY_PORT_RECEIPT_TIME_VALIDATION_RULE,
  INBOUND_REPLAY_PORT_RECEIPT_TIME_VALIDATION_GATE_RULE,
  INBOUND_VERIFICATION_REQUEST_BINDING_RULE,
  INBOUND_VERIFICATION_REQUEST_BINDING_GATE_RULE,
  INBOUND_VERIFICATION_EVALUATION_TIME_BINDING_RULE,
  INBOUND_VERIFICATION_EVALUATION_TIME_BINDING_GATE_RULE,
  INBOUND_REPLAY_NONCE_VALIDATION_RULE,
  INBOUND_REPLAY_NONCE_VALIDATION_GATE_RULE,
]);

registerAuditRulesForIntegrityCheck(AUDIT_RULES);
registerRuntimeAuditManifestInventory(AUDIT_RULES);
