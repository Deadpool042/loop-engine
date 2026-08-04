// Renderer entry point. Runs in a sandboxed, isolated browser context —
// the only privileged surface it can reach is `window.loopGuiApi`
// (see main/preload.ts), a narrow typed API with exactly twelve methods.
// No child_process, no fs, no generic execute().
import type { LoopGuiApi } from "../main/preload-api.js";
import {
  toGuiExecutionError,
  type GuiExecutionError,
} from "../shared/gui-execution-error.js";
import { renderSharedErrorPanel } from "./error-panel.js";
import { escapeHtml } from "./html.js";
import { promptCopyText } from "./project-actions.js";
import {
  goToDashboard,
  goToSettings,
  initialNav,
  selectProject,
  type NavState,
} from "../shared/navigation.js";
import type { ProjectContextReport } from "../shared/project-context.js";
import type { ProjectNextReport } from "../shared/project-next.js";
import type { ProjectPlanReport } from "../shared/project-plan.js";
import type { ProjectPromptReport } from "../shared/project-prompt.js";
import type { ProjectReviewReport } from "../shared/project-review.js";
import {
  EAGER_SECTIONS,
  initialSections,
  toggleSection,
  type SectionsState,
} from "../shared/sections.js";
import type { WorkspaceSummary } from "../shared/workspace-summary.js";
import {
  createSectionLoader,
  type LazySectionState,
  type SectionLoader,
} from "./section-loader.js";

type SummaryProject = Readonly<{
  project: Readonly<{
    name: string;
    path: string;
  }>;
  git: Readonly<{
    branch: string;
    clean: boolean;
  }>;
  docs: unknown;
  validation: unknown;
  health: string;
}>;

declare global {
  interface Window {
    loopGuiApi: LoopGuiApi;
  }
}

const app = document.getElementById("app");

if (!app) {
  throw new Error("missing #app root element");
}

let nav: NavState = { screen: { name: "settings" } };
let currentRepoPath: string | null = null;
let workspaceSummary: WorkspaceSummary | null = null;
let workspaceSummaryError: GuiExecutionError | null = null;
let workspaceSummaryLoading = false;
// Prefill-only suggestion from a single automatic first-launch detection
// attempt (or a later manual "Auto-détecter" click). Never saved on its
// own — the user must still confirm with "Enregistrer".
let suggestedRepoPath: string | null = null;
let autoDetecting = false;

const sectionsByProject = new Map<string, SectionsState>();

function sectionsFor(project: string): SectionsState {
  let state = sectionsByProject.get(project);

  if (!state) {
    state = initialSections();
    sectionsByProject.set(project, state);
  }

  return state;
}

async function boot(): Promise<void> {
  const config = await window.loopGuiApi.getConfig();

  currentRepoPath = config.repoPath;
  nav = initialNav(currentRepoPath !== null);

  if (currentRepoPath !== null) {
    await refreshWorkspaceSummary();
    return;
  }

  // First launch, no configured path yet: try exactly one automatic
  // detection to prefill the field. Never saves — the user must still
  // click "Enregistrer" — and stays on Réglages either way.
  render();
  await runAutoDetect();
}

async function runAutoDetect(): Promise<void> {
  autoDetecting = true;
  render();

  try {
    suggestedRepoPath = await window.loopGuiApi.autoDetectRepoPath();
  } catch {
    suggestedRepoPath = null;
  } finally {
    autoDetecting = false;
    render();
  }
}

function healthBadge(health: string): string {
  const cssClass =
    health === "good" ? "good" : health === "warning" ? "warn" : "bad";

  return `<span class="badge ${cssClass}">${escapeHtml(health)}</span>`;
}

function cleanBadge(clean: boolean): string {
  const cssClass = clean ? "clean" : "dirty";
  const label = clean ? "clean" : "dirty";

  return `<span class="badge ${cssClass}">${label}</span>`;
}

async function refreshWorkspaceSummary(): Promise<void> {
  workspaceSummaryLoading = true;
  workspaceSummaryError = null;
  render();

  try {
    workspaceSummary = await window.loopGuiApi.loadWorkspaceSummary();
  } catch (error) {
    workspaceSummary = null;
    workspaceSummaryError = toGuiExecutionError(error);
  } finally {
    workspaceSummaryLoading = false;
    render();
  }
}

function render(): void {
  if (!app) {
    return;
  }

  if (nav.screen.name === "settings") {
    renderSettings(app);
    return;
  }

  renderSplitView(app);
}

function renderSettings(root: HTMLElement): void {
  const canGoBack = currentRepoPath !== null;

  root.innerHTML = `
    <div class="settings-screen">
      <h1>Réglages</h1>
      <p class="hint">
        Chemin du dépôt Loop Engine
        (contient <code>package.json</code>, <code>projects.yaml</code>,
        <code>pnpm loop</code>).
      </p>

      <div class="settings-row">
        <input
          type="text"
          id="repo-path-input"
          placeholder="/chemin/vers/loop-engine"
          value="${escapeHtml(currentRepoPath ?? suggestedRepoPath ?? "")}"
        />
        <button id="browse-btn" class="ghost">Parcourir…</button>
        <button id="auto-detect-btn" class="ghost" ${autoDetecting ? "disabled" : ""}>
          ${autoDetecting ? "Détection…" : "Auto-détecter"}
        </button>
      </div>

      <div class="settings-actions">
        <button id="save-btn" class="primary">Enregistrer</button>
        ${
          canGoBack
            ? `<button id="back-btn" class="ghost">Retour</button>`
            : ""
        }
      </div>

      <div id="settings-error" class="error-text"></div>
    </div>
  `;

  const input = root.querySelector<HTMLInputElement>("#repo-path-input");
  const errorElement =
    root.querySelector<HTMLElement>("#settings-error");

  if (!input || !errorElement) {
    throw new Error("missing settings elements");
  }

  root.querySelector("#browse-btn")?.addEventListener("click", async () => {
    const picked = await window.loopGuiApi.pickRepoDirectory();

    if (picked) {
      input.value = picked;
    }
  });

  root.querySelector("#auto-detect-btn")?.addEventListener("click", () => {
    void runAutoDetect();
  });

  root.querySelector("#save-btn")?.addEventListener("click", async () => {
    errorElement.textContent = "";

    try {
      const config = await window.loopGuiApi.saveRepoPath(input.value);

      currentRepoPath = config.repoPath;
      nav = goToDashboard(nav);

      await refreshWorkspaceSummary();
    } catch (error) {
      errorElement.textContent =
        error instanceof Error ? error.message : "Erreur inconnue";
    }
  });

  root.querySelector("#back-btn")?.addEventListener("click", () => {
    nav = goToDashboard(nav);
    render();
  });
}

function summaryProjects(): readonly SummaryProject[] {
  if (!workspaceSummary) {
    return [];
  }

  return workspaceSummary.projects.filter(isSummaryProject);
}

function isSummaryProject(value: unknown): value is SummaryProject {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (
    !("project" in value) ||
    !("git" in value) ||
    !("docs" in value) ||
    !("validation" in value) ||
    !("health" in value)
  ) {
    return false;
  }

  const project = value.project;
  const git = value.git;
  const health = value.health;

  return (
    typeof project === "object" &&
    project !== null &&
    "name" in project &&
    typeof project.name === "string" &&
    "path" in project &&
    typeof project.path === "string" &&
    typeof git === "object" &&
    git !== null &&
    "branch" in git &&
    typeof git.branch === "string" &&
    "clean" in git &&
    typeof git.clean === "boolean" &&
    typeof health === "string"
  );
}

function renderSplitView(root: HTMLElement): void {
  const selectedProject =
    nav.screen.name === "project-detail" ? nav.screen.project : null;

  root.innerHTML = `
    <div class="split-view">
      <aside class="project-list">
        <div class="project-list-header">
          <strong>Projets</strong>
          <button id="settings-link" class="ghost" title="Réglages">⚙</button>
        </div>
        <div id="project-rows"></div>
      </aside>

      <main class="detail-pane" id="detail-pane"></main>
    </div>
  `;

  root.querySelector("#settings-link")?.addEventListener("click", () => {
    nav = goToSettings(nav);
    render();
  });

  const rows = root.querySelector<HTMLElement>("#project-rows");
  const detailPane = root.querySelector<HTMLElement>("#detail-pane");

  if (!rows || !detailPane) {
    throw new Error("missing split-view elements");
  }

  if (workspaceSummaryLoading) {
    rows.innerHTML = `<div class="empty-state">Chargement…</div>`;
    detailPane.innerHTML =
      `<div class="empty-state">Chargement des projets…</div>`;
    return;
  }

  if (workspaceSummaryError) {
    rows.innerHTML = `<div class="empty-state">Impossible de charger les projets.</div>`;
    detailPane.innerHTML = "";
    detailPane.appendChild(
      renderSharedErrorPanel(workspaceSummaryError, {
        onRetry: () => void refreshWorkspaceSummary(),
        onOpenSettings: () => {
          nav = goToSettings(nav);
          render();
        },
        onCopyDetails: (details) => void copyToClipboard(details),
      }),
    );
    return;
  }

  const projects = summaryProjects();

  if (projects.length === 0) {
    rows.innerHTML = `<div class="empty-state">Aucun projet.</div>`;
    detailPane.innerHTML =
      `<div class="empty-state">Aucun projet disponible.</div>`;
    return;
  }

  for (const summaryProject of projects) {
    const project = {
      name: summaryProject.project.name,
      path: summaryProject.project.path,
      git: summaryProject.git,
      health: summaryProject.health,
    };

    const row = document.createElement("div");

    row.className =
      "project-row" +
      (project.name === selectedProject ? " selected" : "");

    row.innerHTML = `
      <div class="project-row-top">
        <span class="mono">${escapeHtml(project.name)}</span>
        ${healthBadge(project.health)}
      </div>

      <div class="project-row-bottom">
        ${escapeHtml(project.git.branch)} · ${cleanBadge(project.git.clean)}
      </div>
    `;

    row.addEventListener("click", () => {
      nav = selectProject(nav, project.name);
      render();
    });

    rows.appendChild(row);
  }

  if (!selectedProject) {
    detailPane.innerHTML =
      `<div class="empty-state">Sélectionnez un projet dans la liste.</div>`;
    return;
  }

  renderProjectDetail(detailPane, selectedProject);
}

function ensureSectionOpen(
  projectName: string,
  id: "review" | "prompt",
): void {
  const state = sectionsFor(projectName);

  if (!state.open[id]) {
    sectionsByProject.set(projectName, toggleSection(state, id));
  }
}

function actionStatusLabel<T>(state: LazySectionState<T> | undefined): string {
  if (!state) {
    return "";
  }
  if (state.status === "loading") {
    return `<span class="dim">…</span>`;
  }
  if (state.status === "error") {
    return `<span class="error-text">échec</span>`;
  }
  return `<span class="good">OK</span>`;
}

function renderActionErrorPanel<T>(
  projectName: string,
  loader: SectionLoader<T>,
): HTMLElement | null {
  const state = loader.stateByProject.get(projectName);

  if (!state || state.status !== "error") {
    return null;
  }

  return renderSharedErrorPanel(state.error, {
    onRetry: () => {
      loader.stateByProject.delete(projectName);
      loader.load(projectName, false);
      rerenderDetailIfSelected(projectName);
    },
    onOpenSettings: () => {
      nav = goToSettings(nav);
      render();
    },
    onCopyDetails: (details) => void copyToClipboard(details),
  });
}

function renderActionsBar(projectName: string): HTMLElement {
  const element = document.createElement("div");

  element.className = "actions-bar";

  const validateState = validateLoader.stateByProject.get(projectName);
  const openFolderState = openFolderLoader.stateByProject.get(projectName);
  const canCopyPrompt =
    promptCopyText(promptLoader.stateByProject.get(projectName)) !== null;

  element.innerHTML = `
    <div class="actions-bar-row">
      <button class="ghost action-validate">Validate</button>
      ${actionStatusLabel(validateState)}
      <button class="ghost action-review">Review</button>
      <button class="ghost action-prompt">Prompt</button>
      <button class="ghost action-open-folder">Open Folder</button>
      ${actionStatusLabel(openFolderState)}
      <button class="ghost action-copy-prompt" ${canCopyPrompt ? "" : "disabled"}>Copy Prompt</button>
    </div>
  `;

  element
    .querySelector(".action-validate")
    ?.addEventListener("click", () => {
      validateLoader.load(projectName, false);
      rerenderDetailIfSelected(projectName);
    });

  element.querySelector(".action-review")?.addEventListener("click", () => {
    ensureSectionOpen(projectName, "review");
    rerenderDetailIfSelected(projectName);
  });

  element.querySelector(".action-prompt")?.addEventListener("click", () => {
    ensureSectionOpen(projectName, "prompt");
    rerenderDetailIfSelected(projectName);
  });

  element
    .querySelector(".action-open-folder")
    ?.addEventListener("click", () => {
      openFolderLoader.load(projectName, false);
      rerenderDetailIfSelected(projectName);
    });

  element
    .querySelector(".action-copy-prompt")
    ?.addEventListener("click", () => {
      const text = promptCopyText(promptLoader.stateByProject.get(projectName));
      if (text !== null) {
        void copyToClipboard(text);
      }
    });

  const validateErrorPanel = renderActionErrorPanel(projectName, validateLoader);
  if (validateErrorPanel) {
    element.appendChild(validateErrorPanel);
  }

  const openFolderErrorPanel = renderActionErrorPanel(projectName, openFolderLoader);
  if (openFolderErrorPanel) {
    element.appendChild(openFolderErrorPanel);
  }

  return element;
}

function renderProjectDetail(
  root: HTMLElement,
  projectName: string,
): void {
  const summaryProject = summaryProjects().find(
    (project) => project.project.name === projectName,
  );

  const project = summaryProject
    ? {
        name: summaryProject.project.name,
        path: summaryProject.project.path,
        git: summaryProject.git,
        health: summaryProject.health,
      }
    : undefined;

  if (!project || !summaryProject) {
    root.innerHTML = `
      <div class="empty-state">
        Projet inconnu : ${escapeHtml(projectName)}
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="detail-header">
      <h2>${escapeHtml(project.name)}</h2>
      ${healthBadge(project.health)}
      <span class="mono dim">${escapeHtml(project.path)}</span>
    </div>

    <div id="actions-bar"></div>

    <div id="sections"></div>
  `;

  const actionsBarRoot = root.querySelector<HTMLElement>("#actions-bar");
  const sectionsRoot = root.querySelector<HTMLElement>("#sections");

  if (!actionsBarRoot || !sectionsRoot) {
    throw new Error("missing detail panel elements");
  }

  const state = sectionsFor(projectName);

  actionsBarRoot.appendChild(renderActionsBar(projectName));

  sectionsRoot.appendChild(
    renderSection(
      projectName,
      "status",
      "Statut",
      "json",
      state,
      statusContent(summaryProject),
    ),
  );

  sectionsRoot.appendChild(renderNextSection(projectName, state));
  sectionsRoot.appendChild(renderContextSection(projectName, state));
  sectionsRoot.appendChild(renderPromptSection(projectName, state));
  sectionsRoot.appendChild(renderReviewSection(projectName, state));
  sectionsRoot.appendChild(renderPlanSection(projectName, state));
}

function statusContent(summaryProject: SummaryProject): Readonly<{
  project: unknown;
  git: unknown;
  docs: unknown;
  validation: unknown;
  health: unknown;
}> {
  return {
    project: summaryProject.project,
    git: summaryProject.git,
    docs: summaryProject.docs,
    validation: summaryProject.validation,
    health: summaryProject.health,
  };
}

function rerenderDetailIfSelected(projectName: string): void {
  if (
    nav.screen.name !== "project-detail" ||
    nav.screen.project !== projectName
  ) {
    return;
  }

  const detailPane = document.getElementById("detail-pane");

  if (detailPane) {
    renderProjectDetail(detailPane, projectName);
  }
}

function renderNextSection(
  projectName: string,
  state: SectionsState,
): HTMLElement {
  const isOpenSection = state.open.next;
  const element = document.createElement("div");

  element.className = "section" + (isOpenSection ? " open" : "");

  element.innerHTML = `
    <div class="section-head">
      <span class="caret">▸</span>
      <strong>Prochaine action</strong>
      ${
        EAGER_SECTIONS.includes("next")
          ? `<span class="eager-tag">auto</span>`
          : ""
      }
    </div>

    <div class="section-body"></div>
  `;

  const head = element.querySelector<HTMLElement>(".section-head");
  const body = element.querySelector<HTMLElement>(".section-body");

  if (!head || !body) {
    throw new Error("missing section elements");
  }

  if (isOpenSection) {
    let nextState = nextLoader.stateByProject.get(projectName);

    if (!nextState) {
      nextLoader.load(projectName, false);
      nextState = { status: "loading" };
    }

    if (nextState.status === "loading") {
      body.innerHTML = `<div class="empty-state">Chargement…</div>`;
    } else if (nextState.status === "error") {
      body.appendChild(
        renderSharedErrorPanel(nextState.error, {
          onRetry: () => {
            nextLoader.stateByProject.delete(projectName);
            rerenderDetailIfSelected(projectName);
          },
          onOpenSettings: () => {
            nav = goToSettings(nav);
            render();
          },
          onCopyDetails: (details) => void copyToClipboard(details),
        }),
      );
    } else {
      const pre = document.createElement("pre");

      pre.className = "json-panel mono";
      pre.textContent = JSON.stringify(nextState.value, null, 2);

      body.appendChild(pre);
    }
  }

  head.addEventListener("click", () => {
    const next = toggleSection(sectionsFor(projectName), "next");

    sectionsByProject.set(projectName, next);
    rerenderDetailIfSelected(projectName);
  });

  return element;
}

const nextLoader = createSectionLoader<ProjectNextReport>({
  fetch: (projectName) => window.loopGuiApi.loadProjectNext(projectName),
  onSettled: rerenderDetailIfSelected,
});

const contextLoader = createSectionLoader<ProjectContextReport>({
  fetch: (projectName, refresh) =>
    window.loopGuiApi.loadProjectContext(projectName, refresh),
  onSettled: rerenderDetailIfSelected,
});

const promptLoader = createSectionLoader<ProjectPromptReport>({
  fetch: (projectName, refresh) =>
    window.loopGuiApi.loadProjectPrompt(projectName, refresh),
  onSettled: rerenderDetailIfSelected,
});

const reviewLoader = createSectionLoader<ProjectReviewReport>({
  fetch: (projectName, refresh) =>
    window.loopGuiApi.loadProjectReview(projectName, refresh),
  onSettled: rerenderDetailIfSelected,
});

const planLoader = createSectionLoader<ProjectPlanReport>({
  fetch: (projectName, refresh) =>
    window.loopGuiApi.loadProjectPlan(projectName, refresh),
  onSettled: rerenderDetailIfSelected,
});

const validateLoader = createSectionLoader<void>({
  fetch: (projectName) => window.loopGuiApi.validateProject(projectName),
  onSettled: rerenderDetailIfSelected,
});

const openFolderLoader = createSectionLoader<void>({
  fetch: (projectName) => window.loopGuiApi.openProjectFolder(projectName),
  onSettled: rerenderDetailIfSelected,
});

async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

function renderLazyJsonSection<T>(
  projectName: string,
  state: SectionsState,
  sectionId: "context" | "prompt" | "review" | "plan",
  title: string,
  stateByProject: Map<string, LazySectionState<T>>,
  load: (projectName: string, refresh: boolean) => void,
  bannerHtml?: string,
): HTMLElement {
  const isOpenSection = state.open[sectionId];
  const element = document.createElement("div");

  element.className = "section" + (isOpenSection ? " open" : "");

  element.innerHTML = `
    <div class="section-head">
      <span class="caret">▸</span>
      <strong>${escapeHtml(title)}</strong>
      ${
        EAGER_SECTIONS.includes(sectionId)
          ? `<span class="eager-tag">auto</span>`
          : ""
      }
    </div>

    <div class="section-body"></div>
  `;

  const head = element.querySelector<HTMLElement>(".section-head");
  const body = element.querySelector<HTMLElement>(".section-body");

  if (!head || !body) {
    throw new Error("missing section elements");
  }

  if (isOpenSection) {
    let sectionState = stateByProject.get(projectName);

    if (!sectionState) {
      load(projectName, false);
      sectionState = { status: "loading" };
    }

    if (sectionState.status === "loading") {
      body.innerHTML = `<div class="empty-state">Chargement…</div>`;
    } else if (sectionState.status === "error") {
      body.appendChild(
        renderSharedErrorPanel(sectionState.error, {
          onRetry: () => {
            stateByProject.delete(projectName);
            rerenderDetailIfSelected(projectName);
          },
          onOpenSettings: () => {
            nav = goToSettings(nav);
            render();
          },
          onCopyDetails: (details) => void copyToClipboard(details),
        }),
      );
    } else {
      const text = JSON.stringify(sectionState.value, null, 2);

      body.innerHTML = `
        ${bannerHtml ?? ""}
        <div class="section-toolbar">
          <button class="ghost refresh-section">Actualiser</button>
          <button class="ghost copy-section">Copier</button>
        </div>
      `;

      const pre = document.createElement("pre");

      pre.className = "json-panel mono";
      pre.textContent = text;

      body.appendChild(pre);

      body.querySelector(".refresh-section")?.addEventListener("click", () => {
        stateByProject.delete(projectName);
        load(projectName, true);
        rerenderDetailIfSelected(projectName);
      });

      body.querySelector(".copy-section")?.addEventListener("click", () => {
        void copyToClipboard(text);
      });
    }
  }

  head.addEventListener("click", () => {
    const next = toggleSection(sectionsFor(projectName), sectionId);

    sectionsByProject.set(projectName, next);
    rerenderDetailIfSelected(projectName);
  });

  return element;
}

function renderContextSection(
  projectName: string,
  state: SectionsState,
): HTMLElement {
  return renderLazyJsonSection(
    projectName,
    state,
    "context",
    "Contexte",
    contextLoader.stateByProject,
    contextLoader.load,
  );
}

function renderPromptSection(
  projectName: string,
  state: SectionsState,
): HTMLElement {
  return renderLazyJsonSection(
    projectName,
    state,
    "prompt",
    "Prompt",
    promptLoader.stateByProject,
    promptLoader.load,
  );
}

function renderReviewSection(
  projectName: string,
  state: SectionsState,
): HTMLElement {
  return renderLazyJsonSection(
    projectName,
    state,
    "review",
    "Review",
    reviewLoader.stateByProject,
    reviewLoader.load,
  );
}

function renderPlanSection(
  projectName: string,
  state: SectionsState,
): HTMLElement {
  return renderLazyJsonSection(
    projectName,
    state,
    "plan",
    "Plan (prévisionnel)",
    planLoader.stateByProject,
    planLoader.load,
    `<div class="plan-preview-banner">Prévisualisation uniquement — aucune modification appliquée.</div>`,
  );
}

function renderSection(
  projectName: string,
  id: "status" | "next" | "context" | "prompt" | "review" | "plan",
  title: string,
  kind: "text" | "json",
  state: SectionsState,
  content: unknown,
): HTMLElement {
  const isOpen = state.open[id];
  const element = document.createElement("div");

  element.className = "section" + (isOpen ? " open" : "");

  element.innerHTML = `
    <div class="section-head">
      <span class="caret">▸</span>
      <strong>${escapeHtml(title)}</strong>
      ${
        EAGER_SECTIONS.includes(id)
          ? `<span class="eager-tag">auto</span>`
          : ""
      }
    </div>

    <div class="section-body"></div>
  `;

  const head = element.querySelector<HTMLElement>(".section-head");
  const body = element.querySelector<HTMLElement>(".section-body");

  if (!head || !body) {
    throw new Error("missing section elements");
  }

  if (isOpen) {
    if (kind === "text") {
      body.innerHTML = `<div class="text-panel mono"></div>`;

      const textPanel = body.querySelector<HTMLElement>(".text-panel");

      if (!textPanel) {
        throw new Error("missing text panel");
      }

      textPanel.textContent = String(content);
    } else if (content === undefined) {
      body.innerHTML = `<div class="empty-state">Aucune donnée disponible pour ce projet.</div>`;
    } else {
      const pre = document.createElement("pre");

      pre.className = "json-panel mono";
      pre.textContent = JSON.stringify(content, null, 2);

      body.appendChild(pre);
    }
  }

  head.addEventListener("click", () => {
    const next = toggleSection(sectionsFor(projectName), id);

    sectionsByProject.set(projectName, next);

    const detailPane = document.getElementById("detail-pane");

    if (detailPane) {
      renderProjectDetail(detailPane, projectName);
    }
  });

  return element;
}

void boot();