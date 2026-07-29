import {
  createLoopRuntimeAuthorizedEngineAssemblyRequest,
  type LoopRuntimeAuthorizedEngineAssembler,
  type LoopRuntimeAuthorizedEngineAssemblyFailureReason,
} from "./loop-runtime-public-request-engine-assembly.js";
import { evaluateLoopRuntimeAuthorizedEngineAssembler } from "./loop-runtime-public-request-engine-assembly-evaluation.js";
import {
  decodeAndAuthorizeLoopRuntimePublicRequest,
  type LoopRuntimePublicRequestAuthorizedEntryResult,
} from "./loop-runtime-public-request-authorized-entry.js";
import type {
  LoopRuntimeAuthenticatedPrincipal,
  LoopRuntimePublicRequestAuthorizer,
} from "./loop-runtime-public-request-authorization.js";
import type { LoopRuntimePublicRequest } from "./loop-runtime-public-request.js";
import {
  prepareLoopRuntimePublicRequest,
  type LoopRuntimePublicRequestPreparationResult,
} from "./loop-runtime-public-request-preparation.js";
import type { LoopRuntimeConstructedRuntimeRequest } from "./loop-runtime-public-request-runtime-request.js";

type PreparationFailureReason = Extract<
  LoopRuntimePublicRequestPreparationResult,
  { prepared: false }
>["reason"];

export type LoopRuntimePreparedPublicRequestEntryInput = Readonly<{
  principal: LoopRuntimeAuthenticatedPrincipal;
  payload: unknown;
  authorizer: LoopRuntimePublicRequestAuthorizer;
  assembler: LoopRuntimeAuthorizedEngineAssembler;
}>;

export type LoopRuntimePreparedAuthorizedDecodedRequestInput = Readonly<{
  principal: LoopRuntimeAuthenticatedPrincipal;
  request: LoopRuntimePublicRequest;
  assembler: LoopRuntimeAuthorizedEngineAssembler;
}>;

export type LoopRuntimePreparedPublicRequestEntryResult =
  | Readonly<{
      prepared: true;
      request: LoopRuntimeConstructedRuntimeRequest;
    }>
  | Readonly<{
      prepared: false;
      stage: "decoding";
      reason: Extract<
        LoopRuntimePublicRequestAuthorizedEntryResult,
        { authorized: false; stage: "decoding" }
      >["reason"];
    }>
  | Readonly<{
      prepared: false;
      stage: "authorization";
      reason: "not_authorized";
    }>
  | Readonly<{
      prepared: false;
      stage: "assembly";
      reason: LoopRuntimeAuthorizedEngineAssemblyFailureReason;
    }>
  | Readonly<{
      prepared: false;
      stage: "preparation";
      reason: PreparationFailureReason;
    }>;

function failDecoding(
  reason: Extract<
    LoopRuntimePublicRequestAuthorizedEntryResult,
    { authorized: false; stage: "decoding" }
  >["reason"],
): LoopRuntimePreparedPublicRequestEntryResult {
  return Object.freeze({
    prepared: false as const,
    stage: "decoding" as const,
    reason,
  });
}

function failAuthorization(): LoopRuntimePreparedPublicRequestEntryResult {
  return Object.freeze({
    prepared: false as const,
    stage: "authorization" as const,
    reason: "not_authorized" as const,
  });
}

function failAssembly(
  reason: LoopRuntimeAuthorizedEngineAssemblyFailureReason,
): LoopRuntimePreparedPublicRequestEntryResult {
  return Object.freeze({
    prepared: false as const,
    stage: "assembly" as const,
    reason,
  });
}

function failPreparation(
  reason: PreparationFailureReason,
): LoopRuntimePreparedPublicRequestEntryResult {
  return Object.freeze({
    prepared: false as const,
    stage: "preparation" as const,
    reason,
  });
}

export async function prepareAuthorizedLoopRuntimeDecodedRequest(
  input: LoopRuntimePreparedAuthorizedDecodedRequestInput,
): Promise<LoopRuntimePreparedPublicRequestEntryResult> {
  const assemblyRequest = createLoopRuntimeAuthorizedEngineAssemblyRequest(
    input.principal,
    input.request,
  );

  if (!assemblyRequest.created) {
    return failAssembly("invalid_assembly");
  }

  const assembly = await evaluateLoopRuntimeAuthorizedEngineAssembler(
    assemblyRequest.assemblyRequest,
    input.assembler,
  );

  if (!assembly.assembled) {
    return failAssembly(assembly.reason);
  }

  const preparation = prepareLoopRuntimePublicRequest({
    request: input.request,
    catalog: assembly.assembly.catalog,
    limits: assembly.assembly.limits,
    binding: assembly.assembly.binding,
    allowDryRun: input.assembler.allowDryRunPreparation === true,
  });

  if (!preparation.prepared) {
    return failPreparation(preparation.reason);
  }

  return Object.freeze({
    prepared: true as const,
    request: preparation.runtimeRequest,
  });
}

export async function prepareAuthorizedLoopRuntimeRequest(
  input: LoopRuntimePreparedPublicRequestEntryInput,
): Promise<LoopRuntimePreparedPublicRequestEntryResult> {
  const authorized = await decodeAndAuthorizeLoopRuntimePublicRequest({
    principal: input.principal,
    payload: input.payload,
    authorizer: input.authorizer,
  });

  if (!authorized.authorized) {
    if (authorized.stage === "decoding") {
      return failDecoding(authorized.reason);
    }

    return failAuthorization();
  }

  return prepareAuthorizedLoopRuntimeDecodedRequest({
    principal: input.principal,
    request: authorized.request,
    assembler: input.assembler,
  });
}
