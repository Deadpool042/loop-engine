import { useEffect, useRef, useState } from "react";
import { Button } from "./components/ui/button.js";
import { parseContextDetail, type ContextDetail } from "./context-contract.js";
import { parseReviewDetail, type ReviewDetail } from "./review-contract.js";
import {
  formatPlanSteps,
  hasAddressableCandidate,
  isPlanForSelectedProject,
  parsePlanDetail,
  parsePlanFailure,
  type PlanDetail,
} from "./plan-contract.js";
import type { DesktopExecuteProvider } from "./execute-handler.js";
import {
  buildGuidedFlowSteps,
  getFocusedGuidedFlowStepId,
} from "./guided-flow.js";
import {
  parseSummaryResponse,
  type SummaryProject,
} from "./summary-contract.js";

const healthTone = {
  good: "bg-emerald-500",
  warning: "bg-amber-400",
  error: "bg-rose-500",
} as const;

function HealthMark({
  health,
}: Pick<SummaryProject, "health">): React.JSX.Element {
  return (
    <span className="flex items-center gap-2 text-xs font-medium text-loop-muted">
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${healthTone[health]}`}
      />
      {health}
    </span>
  );
}

export function App(): React.JSX.Element {
  const [projects, setProjects] = useState<readonly SummaryProject[]>([]);
  const [selectedProjectName, setSelectedProjectName] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [contextDetail, setContextDetail] = useState<ContextDetail | null>(
    null,
  );
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [reviewDetail, setReviewDetail] = useState<ReviewDetail | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [planDetail, setPlanDetail] = useState<PlanDetail | null>(null);
  const [planProjectName, setPlanProjectName] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [executeProvider, setExecuteProvider] = useState<DesktopExecuteProvider>("claude_code");
  const [executeLoading, setExecuteLoading] = useState(false);
  const [executeMessage, setExecuteMessage] = useState<string | null>(null);
  const [executeResult, setExecuteResult] = useState<Record<string, unknown> | null>(null);
  const planRequestId = useRef(0);
  const selectedProject =
    projects.find((project) => project.project.name === selectedProjectName) ??
    null;
  const selectedCandidate = contextDetail?.roadmap.selectedCandidate ?? null;
  const guidedFlowSteps = buildGuidedFlowSteps({
    hasProject: selectedProject !== null,
    contextLoading,
    hasCandidate: selectedCandidate !== null,
    candidateAddressable: hasAddressableCandidate(selectedCandidate),
    hasPlan:
      planDetail !== null &&
      isPlanForSelectedProject(planProjectName, selectedProjectName),
    hasExecutionOutcome: executeResult !== null || executeMessage !== null,
  });
  const focusedStepId = getFocusedGuidedFlowStepId(guidedFlowSteps);

  useEffect(() => {
    if (selectedProjectName === null) {
      setContextDetail(null);
      setContextError(null);
      setContextLoading(false);
      return;
    }

    let active = true;
    setContextDetail(null);
    setContextError(null);
    setContextLoading(true);

    void window.loopDesktop
      .context(selectedProjectName)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setContextError(result.raw);
          return;
        }

        const detail = parseContextDetail(result.json);
        if (detail === null) {
          setContextError(
            "La réponse context ne respecte pas le contrat JSON attendu.",
          );
          return;
        }

        setContextDetail(detail);
      })
      .finally(() => {
        if (active) setContextLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedProjectName]);

  useEffect(() => {
    planRequestId.current += 1;
    setPlanDetail(null);
    setPlanProjectName(null);
    setPlanError(null);
    setPlanLoading(false);
  }, [selectedProjectName]);

  function selectProject(projectName: string): void {
    planRequestId.current += 1;
    setPlanDetail(null);
    setPlanProjectName(null);
    setPlanError(null);
    setPlanLoading(false);
    setSelectedProjectName(projectName);
  }

  async function preparePlan(): Promise<void> {
    const candidate = contextDetail?.roadmap.selectedCandidate;
    if (selectedProjectName === null || !hasAddressableCandidate(candidate)) return;

    const projectName = selectedProjectName;
    const candidateId = candidate.id;
    const requestId = planRequestId.current + 1;
    planRequestId.current = requestId;
    setPlanDetail(null);
    setPlanProjectName(null);
    setPlanError(null);
    setPlanLoading(true);

    try {
      const result = await window.loopDesktop.plan(projectName, candidateId);
      if (requestId !== planRequestId.current) return;
      if (!result.ok) {
        setPlanError(result.raw);
        return;
      }

      const failure = parsePlanFailure(result.json);
      if (failure) {
        setPlanError(`${failure.code}: ${failure.message}`);
        return;
      }

      const plan = parsePlanDetail(result.json);
      if (plan === null) {
        setPlanError("La réponse plan ne respecte pas le contrat JSON attendu.");
        return;
      }
      if (plan.project !== projectName || plan.candidate.id !== candidateId) {
        setPlanError("Le plan retourné ne correspond pas au candidat demandé.");
        return;
      }

      setPlanDetail(plan);
      setPlanProjectName(projectName);
      if (plan.profile?.provider === "openai") setExecuteProvider("codex");
      if (plan.profile?.provider === "anthropic") setExecuteProvider("claude_code");
    } catch {
      if (requestId === planRequestId.current) {
        setPlanError("Impossible de préparer le plan.");
      }
    } finally {
      if (requestId === planRequestId.current) setPlanLoading(false);
    }
  }

  async function executePlan(): Promise<void> {
    const candidate = planDetail?.candidate;
    if (selectedProjectName === null || !candidate) return;
    setExecuteLoading(true);
    setExecuteMessage(null);
    setExecuteResult(null);
    try {
      const result = await window.loopDesktop.execute({
        projectName: selectedProjectName,
        candidateId: candidate.id,
        provider: executeProvider,
      });
      if (!result.ok) {
        setExecuteMessage(
          result.kind === "cancelled" ? "Exécution annulée avant démarrage." : result.raw,
        );
      } else if (typeof result.json === "object" && result.json !== null && !Array.isArray(result.json)) {
        setExecuteResult(result.json as Record<string, unknown>);
      } else {
        setExecuteMessage("La réponse execute ne respecte pas le contrat JSON attendu.");
      }
    } catch {
      setExecuteMessage("Impossible de lancer l’exécution isolée.");
    } finally {
      setExecuteLoading(false);
    }
  }

  useEffect(() => {
    if (selectedProjectName === null) {
      setReviewDetail(null);
      setReviewError(null);
      setReviewLoading(false);
      return;
    }

    let active = true;
    setReviewDetail(null);
    setReviewError(null);
    setReviewLoading(true);

    void window.loopDesktop
      .review(selectedProjectName)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setReviewError(result.raw);
          return;
        }

        const detail = parseReviewDetail(result.json);
        if (detail === null) {
          setReviewError(
            "La réponse review ne respecte pas le contrat JSON attendu.",
          );
          return;
        }

        setReviewDetail(detail);
      })
      .finally(() => {
        if (active) setReviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedProjectName]);

  async function refreshSummary(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const result = await window.loopDesktop.summary();
      if (!result.ok) {
        setProjects([]);
        setSelectedProjectName(null);
        setError(result.raw);
        return;
      }

      const summary = parseSummaryResponse(result.json);
      if (!summary) {
        setProjects([]);
        setSelectedProjectName(null);
        setError("La réponse summary ne respecte pas le contrat JSON attendu.");
        return;
      }

      setProjects(summary.projects);
      setSelectedProjectName((current) =>
        summary.projects.some((project) => project.project.name === current)
          ? current
          : (summary.projects[0]?.project.name ?? null),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex h-screen min-h-[640px] flex-col overflow-hidden bg-loop-paper">
      <header className="flex shrink-0 items-center justify-between border-b border-loop-line bg-loop-panel px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="m-0 text-sm font-semibold tracking-tight">
            Loop Engine
          </h1>
          <span className="text-xs text-loop-muted">
            Cockpit local · exécution gouvernée
          </span>
        </div>
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-loop-muted">
          Développement
        </span>
      </header>

      <section className="flex shrink-0 items-center justify-between gap-4 border-b border-loop-line bg-loop-panel px-5 py-3">
        <ol className="flex min-w-0 flex-1 items-center gap-2" aria-label="Progression du développement">
          {guidedFlowSteps.map((step, index) => {
            const tone =
              step.status === "done"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : step.status === "active"
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : step.status === "blocked"
                    ? "border-rose-200 bg-rose-50 text-rose-900"
                    : "border-loop-line bg-white text-loop-muted";
            return (
              <li key={step.id} className="flex min-w-0 items-center gap-2">
                <span
                  className={`inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${tone}`}
                  aria-current={step.status === "active" ? "step" : undefined}
                >
                  <span aria-hidden="true">{index + 1}</span>
                  <span className="truncate">{step.label}</span>
                </span>
                {index < guidedFlowSteps.length - 1 && (
                  <span aria-hidden="true" className="h-px w-4 shrink-0 bg-loop-line" />
                )}
              </li>
            );
          })}
        </ol>
        <Button type="button" disabled={loading} onClick={refreshSummary}>
          {loading ? "Chargement…" : "Actualiser"}
        </Button>
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,0.8fr)_minmax(0,2fr)]">
        <aside
          className="min-h-0 overflow-y-auto border-r border-loop-line bg-loop-panel"
          aria-label="Projects"
        >
          <div className="border-b border-loop-line px-5 py-4">
            <p className="m-0 text-xs font-medium uppercase tracking-[0.14em] text-loop-muted">
              Projets
            </p>
          </div>
          {loading && (
            <p className="px-5 py-6 text-sm text-loop-muted">
              Chargement des projets…
            </p>
          )}
          {!loading && error && (
            <p className="px-5 py-6 text-sm text-rose-700">
              Impossible de charger le summary.
            </p>
          )}
          {!loading && !error && projects.length === 0 && (
            <p className="px-5 py-6 text-sm text-loop-muted">
              Actualisez pour afficher les projets.
            </p>
          )}
          {!loading &&
            !error &&
            projects.map((project) => {
              const selected = project.project.name === selectedProjectName;
              return (
                <button
                  key={project.project.name}
                  type="button"
                  onClick={() => selectProject(project.project.name)}
                  className={`w-full border-b border-loop-line px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-400 ${selected ? "bg-neutral-100" : "hover:bg-neutral-50"}`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold">
                      {project.project.name}
                    </span>
                    <HealthMark health={project.health} />
                  </span>
                  <span className="mt-1 block truncate text-xs text-loop-muted">
                    {project.git.branch}
                  </span>
                </button>
              );
            })}
        </aside>

        <section className="min-h-0 overflow-y-auto p-6" aria-live="polite">
          {error && (
            <div className="max-w-2xl rounded-md border border-rose-200 bg-rose-50 p-5">
              <h2 className="m-0 text-base font-semibold text-rose-950">
                Erreur technique
              </h2>
              <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words text-xs text-rose-900">
                {error}
              </pre>
            </div>
          )}
          {!error && !selectedProject && !loading && (
            <div className="max-w-xl border-l-2 border-loop-line pl-5">
              <h2 className="m-0 text-lg font-semibold">
                Aucun projet sélectionné
              </h2>
              <p className="mt-2 text-sm leading-6 text-loop-muted">
                La sélection apparaîtra ici après le chargement du summary.
              </p>
            </div>
          )}
          {!error && selectedProject && (
            <article className="max-w-3xl">
              <div className="flex items-start justify-between gap-4 border-b border-loop-line pb-6">
                <div>
                  <p className="m-0 text-xs font-medium uppercase tracking-[0.14em] text-loop-muted">
                    Projet sélectionné
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                    {selectedProject.project.name}
                  </h2>
                </div>
                <HealthMark health={selectedProject.health} />
              </div>
              <dl className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                    Type
                  </dt>
                  <dd className="mt-2 text-sm font-medium">
                    {selectedProject.project.type}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                    État Git
                  </dt>
                  <dd className="mt-2 text-sm font-medium">
                    {selectedProject.git.clean ? "Propre" : "Modifié"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                    Branche
                  </dt>
                  <dd className="mt-2 break-all text-sm font-medium">
                    {selectedProject.git.branch}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                    Santé
                  </dt>
                  <dd className="mt-2">
                    <HealthMark health={selectedProject.health} />
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                    Chemin
                  </dt>
                  <dd className="mt-2 break-all font-mono text-xs text-loop-muted">
                    {selectedProject.project.path}
                  </dd>
                </div>
              </dl>
              {focusedStepId === "work" && (
              <section className="mt-8 border-t border-loop-line pt-6">
                <h3 className="m-0 text-base font-semibold">Contexte projet</h3>
                {contextLoading && (
                  <p className="mt-3 text-sm text-loop-muted">
                    Chargement du contexte…
                  </p>
                )}
                {contextError && (
                  <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded-md border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900">
                    {contextError}
                  </pre>
                )}
                {contextDetail && (
                  <div className="mt-5 grid gap-6">
                    <section>
                      <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                        Documentation
                      </h4>
                      <p className="mt-2 text-sm">
                        {contextDetail.docs.missing.length === 0
                          ? "Toutes les sources requises sont présentes."
                          : `${contextDetail.docs.missing.length} source(s) requise(s) manquante(s).`}
                      </p>
                      <ul className="mt-2 space-y-1 font-mono text-xs text-loop-muted">
                        {contextDetail.docs.required.map((path) => (
                          <li key={path}>{path}</li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                        Roadmap
                      </h4>
                      <p className="mt-2 text-sm">
                        {contextDetail.roadmap.available
                          ? "Roadmap configurée."
                          : "Aucune roadmap configurée."}
                      </p>
                      {contextDetail.roadmap.paths.map((path) => (
                        <p
                          key={path}
                          className="mt-1 font-mono text-xs text-loop-muted"
                        >
                          {path}
                        </p>
                      ))}
                      {contextDetail.roadmap.phaseGates
                        .filter((gate) => gate.state === "closed")
                        .map((gate) => (
                          <p key={gate.phaseId} className="mt-2 text-sm text-loop-muted">
                            Phase {gate.phaseId} fermée
                            {gate.blockedBy ? ` par la gate ${gate.blockedBy}.` : "."}
                            {" Les candidats de cette phase ne sont pas admissibles."}
                          </p>
                        ))}
                      {contextDetail.roadmap.selectedCandidate && (
                        <div className="mt-3 rounded-md border border-loop-line p-4 text-sm">
                          <p className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                            Prochain travail recommandé
                          </p>
                          {contextDetail.roadmap.selectedCandidate.id && (
                            <p className="mt-2 font-mono text-sm font-semibold">
                              {contextDetail.roadmap.selectedCandidate.id}
                            </p>
                          )}
                          <p className="mt-2">
                            {contextDetail.roadmap.selectedCandidate.text}
                          </p>
                          <p className="mt-2 font-medium">
                            {contextDetail.roadmap.selectedCandidate.kind} ·{" "}
                            {contextDetail.roadmap.selectedCandidate.status}
                          </p>
                          <p className="mt-2 font-mono text-xs text-loop-muted">
                            {contextDetail.roadmap.selectedCandidate.path}:
                            {contextDetail.roadmap.selectedCandidate.line}
                          </p>
                          {!hasAddressableCandidate(
                            contextDetail.roadmap.selectedCandidate,
                          ) ? (
                            <p className="mt-3 text-xs text-loop-muted">
                              Ce candidat ne possède pas d’identifiant adressable ; le plan explicite est indisponible.
                            </p>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              className="mt-3"
                              disabled={planLoading}
                              onClick={preparePlan}
                            >
                              {planLoading ? "Préparation…" : "Préparer le plan"}
                            </Button>
                          )}
                        </div>
                      )}
                    </section>
                    <section>
                      <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                        Validation
                      </h4>
                      <p className="mt-2 text-sm">
                        {contextDetail.validation.configured
                          ? "Commandes configurées."
                          : "Aucune commande configurée."}
                      </p>
                      <ul className="mt-2 space-y-1 font-mono text-xs text-loop-muted">
                        {contextDetail.validation.commands.map((command) => (
                          <li key={command}>{command}</li>
                        ))}
                      </ul>
                    </section>
                  </div>
                )}
              </section>
              )}
              {(focusedStepId === "prepare" || focusedStepId === "execute" || focusedStepId === "result") && (
              <section className="mt-8 border-t border-loop-line pt-6">
                <h3 className="m-0 text-base font-semibold">
                  {focusedStepId === "prepare"
                    ? "Préparation"
                    : focusedStepId === "execute"
                      ? "Exécution"
                      : "Résultat"}
                </h3>
                {planLoading && (
                  <p className="mt-3 text-sm text-loop-muted">
                    Préparation du plan…
                  </p>
                )}
                {planError && (
                  <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded-md border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900">
                    {planError}
                  </pre>
                )}
                {planDetail &&
                  isPlanForSelectedProject(planProjectName, selectedProjectName) && (
                  <div className="mt-5 grid gap-6">
                    <section>
                      <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                        Candidat confirmé
                      </h4>
                      <p className="mt-2 font-mono text-sm font-semibold">
                        {planDetail.candidate.id}
                      </p>
                      <p className="mt-2 text-sm">{planDetail.candidate.text}</p>
                      <p className="mt-2 text-sm font-medium">
                        {planDetail.candidate.kind} · {planDetail.candidate.status}
                      </p>
                      <p className="mt-2 text-xs text-loop-muted">
                        Projet : {planDetail.project} · mode : plan
                      </p>
                    </section>
                    <section>
                      <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                        Politique prévisionnelle
                      </h4>
                      {planDetail.profile ? (
                        <p className="mt-2 text-sm">
                          {planDetail.profile.id} · {planDetail.profile.provider} ·{" "}
                          {planDetail.profile.model} · effort {planDetail.profile.effort}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-loop-muted">
                          Aucun profil prévisionnel sélectionné.
                        </p>
                      )}
                    </section>
                    <section>
                      <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                        Étapes prévues
                      </h4>
                      <ul className="mt-2 space-y-1 text-sm">
                        {formatPlanSteps(planDetail).map((detail, index) => (
                          <li key={`${index}:${detail}`}>{detail}</li>
                        ))}
                      </ul>
                    </section>
                    {planDetail.context && (
                      <section>
                        <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                          Contexte borné
                        </h4>
                        <p className="mt-2 text-sm">
                          {planDetail.context.files.length} fichier(s) ·{" "}
                          {planDetail.context.estimatedTokens} tokens estimés
                          {planDetail.context.truncated ? " · tronqué" : ""}
                        </p>
                        <ul className="mt-2 space-y-1 font-mono text-xs text-loop-muted">
                          {planDetail.context.files.map((path) => (
                            <li key={path}>{path}</li>
                          ))}
                        </ul>
                      </section>
                    )}
                    <p className="m-0 text-xs text-loop-muted">
                      Ce plan n’exécute aucun provider.
                    </p>
                    <section className="border-t border-loop-line pt-6">
                      <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                        Exécution isolée confirmée
                      </h4>
                      <p className="mt-2 text-sm">Projet : {planDetail.project} · candidat : {planDetail.candidate.id}</p>
                      <label className="mt-3 block text-sm" htmlFor="execute-provider">
                        Provider approuvé
                      </label>
                      <select id="execute-provider" className="mt-1 rounded border border-loop-line bg-white p-2 text-sm" value={executeProvider} disabled={executeLoading} onChange={(event) => setExecuteProvider(event.target.value as DesktopExecuteProvider)}>
                        <option value="claude_code">Claude Code</option>
                        <option value="codex">Codex</option>
                      </select>
                      <p className="mt-3 text-sm">Validations prévues : {contextDetail?.validation.commands.length ?? 0} · maxRepairs : 0</p>
                      <p className="mt-2 text-sm text-loop-muted">Le provider s’exécute dans un worktree Git isolé, mais n’est pas sandboxé au niveau du système d’exploitation.</p>
                      <p className="mt-2 text-sm text-loop-muted">Le dépôt source ne sera pas modifié et le patch ne sera pas appliqué automatiquement.</p>
                      <Button type="button" size="sm" className="mt-3" disabled={executeLoading} onClick={executePlan}>
                        {executeLoading ? "Exécution isolée en cours…" : "Confirmer et choisir la destination du patch"}
                      </Button>
                      {executeMessage && <p className="mt-3 text-sm text-loop-muted">{executeMessage}</p>}
                      {executeResult && <div className="mt-3 text-sm"><p>Résultat : {String(executeResult.status ?? "inconnu")}</p><p>Patch exporté : {executeResult.patchExport ? "oui" : "non"}</p><p>Dépôt source non modifié.</p>{typeof executeResult.patchExport === "object" && executeResult.patchExport !== null && <pre className="mt-2 overflow-auto rounded bg-neutral-100 p-3 text-xs">{JSON.stringify(executeResult.patchExport, null, 2)}</pre>}{typeof executeResult.failure === "object" && executeResult.failure !== null && <pre className="mt-2 overflow-auto rounded bg-rose-50 p-3 text-xs text-rose-900">{JSON.stringify(executeResult.failure, null, 2)}</pre>}</div>}
                    </section>
                  </div>
                )}
              </section>
              )}
              {focusedStepId === "result" && (
              <section className="mt-8 border-t border-loop-line pt-6">
                <h3 className="m-0 text-base font-semibold">Review</h3>
                {reviewLoading && (
                  <p className="mt-3 text-sm text-loop-muted">
                    Chargement de la review…
                  </p>
                )}
                {reviewError && (
                  <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded-md border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900">
                    {reviewError}
                  </pre>
                )}
                {reviewDetail && (
                  <div className="mt-5 grid gap-6">
                    <section>
                      <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                        État Git
                      </h4>
                      <p className="mt-2 text-sm">
                        {reviewDetail.git.requiresGit
                          ? `${reviewDetail.git.branch} · ${reviewDetail.git.clean ? "propre" : "modifié"}`
                          : "Git non requis."}
                      </p>
                      {reviewDetail.gitStatus && (
                        <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-md border border-loop-line p-4 font-mono text-xs text-loop-muted">
                          {reviewDetail.gitStatus}
                        </pre>
                      )}
                    </section>
                    <section>
                      <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                        Diff
                      </h4>
                      {reviewDetail.diffStat ? (
                        <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-md border border-loop-line p-4 font-mono text-xs text-loop-muted">
                          {reviewDetail.diffStat}
                        </pre>
                      ) : (
                        <p className="mt-2 text-sm text-loop-muted">
                          Aucun résumé de diff.
                        </p>
                      )}
                      {reviewDetail.documentationImpact.changedPaths.length >
                        0 && (
                        <ul className="mt-3 space-y-1 font-mono text-xs text-loop-muted">
                          {reviewDetail.documentationImpact.changedPaths.map(
                            (path) => (
                              <li key={path}>{path}</li>
                            ),
                          )}
                        </ul>
                      )}
                    </section>
                    <section>
                      <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                        Impact documentaire
                      </h4>
                      <p className="mt-2 text-sm">
                        {reviewDetail.documentationImpact.semanticReviewRequired
                          ? "Review sémantique requise."
                          : "Review sémantique non requise."}
                      </p>
                      {reviewDetail.documentationImpact.impacts.length === 0 ? (
                        <p className="mt-2 text-sm text-loop-muted">
                          Aucun impact documentaire gouverné.
                        </p>
                      ) : (
                        <ul className="mt-3 space-y-3 text-sm">
                          {reviewDetail.documentationImpact.impacts.map(
                            (impact) => (
                              <li key={`${impact.document}:${impact.reason}`}>
                                <p className="m-0 font-mono text-xs text-loop-muted">
                                  {impact.required
                                    ? "obligatoire"
                                    : "optionnel"}{" "}
                                  · {impact.document}
                                </p>
                                <p className="mt-1">{impact.reason}</p>
                              </li>
                            ),
                          )}
                        </ul>
                      )}
                    </section>
                    <section>
                      <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                        Validation
                      </h4>
                      <p className="mt-2 text-sm">
                        {reviewDetail.validation.configured
                          ? "Commandes configurées."
                          : "Aucune commande configurée."}
                      </p>
                      <ul className="mt-2 space-y-1 font-mono text-xs text-loop-muted">
                        {reviewDetail.validation.commands.map((command) => (
                          <li key={command}>{command}</li>
                        ))}
                      </ul>
                      <div className="mt-3">
                        <HealthMark health={reviewDetail.health} />
                      </div>
                    </section>
                  </div>
                )}
              </section>
              )}
            </article>
          )}
        </section>
      </div>
    </main>
  );
}
