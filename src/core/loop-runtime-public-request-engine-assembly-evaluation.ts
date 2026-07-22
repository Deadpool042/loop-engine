import {
  type LoopRuntimeAuthorizedEngineAssembler,
  type LoopRuntimeAuthorizedEngineAssembly,
  type LoopRuntimeAuthorizedEngineAssemblyFailureReason,
  type LoopRuntimeAuthorizedEngineAssemblyRequest,
  type LoopRuntimeAuthorizedEngineAssemblyResult,
} from "./loop-runtime-public-request-engine-assembly.js";
import { validateLoopRuntimePublicRequest } from "./loop-runtime-public-request.js";

const ASSEMBLY_UNAVAILABLE = Object.freeze({
  assembled: false as const,
  reason: "assembly_unavailable" as const,
});

const ASSEMBLY_AMBIGUOUS = Object.freeze({
  assembled: false as const,
  reason: "assembly_ambiguous" as const,
});

const INVALID_ASSEMBLY = Object.freeze({
  assembled: false as const,
  reason: "invalid_assembly" as const,
});

function isOrdinaryObject(value: unknown): value is Record<PropertyKey, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function getDataDescriptors(
  value: unknown,
): Readonly<Record<PropertyKey, PropertyDescriptor>> | null {
  if (!isOrdinaryObject(value)) {
    return null;
  }

  return Object.getOwnPropertyDescriptors(value);
}

function hasExactKeys(
  descriptors: Readonly<Record<PropertyKey, PropertyDescriptor>>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Reflect.ownKeys(descriptors);

  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => keys.includes(key))
  );
}

function isEnumerableDataProperty(
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { value: unknown } {
  return (
    descriptor !== undefined &&
    descriptor.enumerable === true &&
    "value" in descriptor &&
    !("get" in descriptor) &&
    !("set" in descriptor)
  );
}

function invalidAssemblyResult():
  LoopRuntimeAuthorizedEngineAssemblyResult {
  return INVALID_ASSEMBLY;
}

function failureResult(
  reason: LoopRuntimeAuthorizedEngineAssemblyFailureReason,
): LoopRuntimeAuthorizedEngineAssemblyResult {
  if (reason === "assembly_unavailable") {
    return ASSEMBLY_UNAVAILABLE;
  }

  if (reason === "assembly_ambiguous") {
    return ASSEMBLY_AMBIGUOUS;
  }

  return INVALID_ASSEMBLY;
}

function isValidAssembly(
  assembly: unknown,
): assembly is LoopRuntimeAuthorizedEngineAssembly {
  const descriptors = getDataDescriptors(assembly);

  if (
    descriptors === null ||
    !hasExactKeys(descriptors, ["catalog", "limits", "binding"])
  ) {
    return false;
  }

  return (
    isEnumerableDataProperty(descriptors.catalog) &&
    isEnumerableDataProperty(descriptors.limits) &&
    isEnumerableDataProperty(descriptors.binding)
  );
}

function validateAssemblyRequest(
  request: LoopRuntimeAuthorizedEngineAssemblyRequest,
): boolean {
  const descriptors = getDataDescriptors(request);

  if (
    descriptors === null ||
    !hasExactKeys(descriptors, ["principalId", "request"]) ||
    !isEnumerableDataProperty(descriptors.principalId) ||
    !isEnumerableDataProperty(descriptors.request) ||
    typeof descriptors.principalId.value !== "string" ||
    descriptors.principalId.value.trim().length === 0
  ) {
    return false;
  }

  const validation = validateLoopRuntimePublicRequest(
    descriptors.request.value as never,
  );

  return validation.valid;
}

function readAssembleFunction(
  assembler: LoopRuntimeAuthorizedEngineAssembler,
): ((request: LoopRuntimeAuthorizedEngineAssemblyRequest) => unknown) | null {
  if (typeof assembler !== "object" || assembler === null) {
    return null;
  }

  const descriptors = Object.getOwnPropertyDescriptors(assembler);

  if (
    !hasExactKeys(descriptors, ["assemble"]) ||
    !isEnumerableDataProperty(descriptors.assemble) ||
    typeof descriptors.assemble.value !== "function"
  ) {
    return null;
  }

  return descriptors.assemble.value as (
    request: LoopRuntimeAuthorizedEngineAssemblyRequest,
  ) => unknown;
}

function canonicalizeAssemblyResult(
  result: unknown,
): LoopRuntimeAuthorizedEngineAssemblyResult {
  const descriptors = getDataDescriptors(result);

  if (
    descriptors === null ||
    !isEnumerableDataProperty(descriptors.assembled) ||
    typeof descriptors.assembled.value !== "boolean"
  ) {
    return invalidAssemblyResult();
  }

  if (descriptors.assembled.value === false) {
    if (
      !hasExactKeys(descriptors, ["assembled", "reason"]) ||
      !isEnumerableDataProperty(descriptors.reason) ||
      (descriptors.reason.value !== "assembly_unavailable" &&
        descriptors.reason.value !== "assembly_ambiguous" &&
        descriptors.reason.value !== "invalid_assembly")
    ) {
      return invalidAssemblyResult();
    }

    return failureResult(descriptors.reason.value);
  }

  if (
    !hasExactKeys(descriptors, ["assembled", "assembly"]) ||
    !isEnumerableDataProperty(descriptors.assembly) ||
    !isValidAssembly(descriptors.assembly.value)
  ) {
    return invalidAssemblyResult();
  }

  const assemblyDescriptors = Object.getOwnPropertyDescriptors(
    descriptors.assembly.value,
  ) as Readonly<
    Record<"catalog" | "limits" | "binding", PropertyDescriptor & {
      value: LoopRuntimeAuthorizedEngineAssembly[keyof LoopRuntimeAuthorizedEngineAssembly];
    }>
  >;
  const assembly = Object.freeze({
    catalog: assemblyDescriptors.catalog!.value,
    limits: assemblyDescriptors.limits!.value,
    binding: assemblyDescriptors.binding!.value,
  });

  return Object.freeze({
    assembled: true as const,
    assembly,
  });
}

export async function evaluateLoopRuntimeAuthorizedEngineAssembler(
  request: LoopRuntimeAuthorizedEngineAssemblyRequest,
  assembler: LoopRuntimeAuthorizedEngineAssembler,
): Promise<LoopRuntimeAuthorizedEngineAssemblyResult> {
  try {
    if (!validateAssemblyRequest(request)) {
      return invalidAssemblyResult();
    }

    const assemble = readAssembleFunction(assembler);

    if (assemble === null) {
      return invalidAssemblyResult();
    }

    const result = await Reflect.apply(assemble, assembler, [request]);

    return canonicalizeAssemblyResult(result);
  } catch {
    return invalidAssemblyResult();
  }
}
