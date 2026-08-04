// Renderer entry point. Runs in a sandboxed, isolated browser context —
// the only privileged surface it can reach is `window.loopGuiApi`
// (see main/preload.ts), a narrow typed API with exactly three methods.
// No child_process, no fs, no generic execute().
import type { LoopGuiApi } from "../main/preload-api.js";
import {
  goToDashboard,
  goToSettings,
  initialNav,
  selectProject,
  type NavState,
} from "../shared/navigation.js";
import { EAGER_SECTIONS, initialSections, toggleSection, type SectionsState } from "../shared/sections.js";
import { FIXTURE_DETAIL, FIXTURE_PROJECTS } from "../shared/fixtures.js";

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
  render();
}

function healthBadge(health: string): string {
  const cls = health === "good" ? "good" : health === "warning" ? "warn" : "bad";
  return `<span class="badge ${cls}">${escapeHtml(health)}</span>`;
}

function cleanBadge(clean: boolean): string {
  return `<span class="badge ${clean ? "clean" : "dirty"}">${clean ? "clean" : "dirty"}</span>`;
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function render(): void {
  if (!app) return;
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
      <p class="hint">Chemin du dépôt Loop Engine (contient <code>package.json</code>, <code>projects.yaml</code>, <code>pnpm loop</code>).</p>
      <div class="settings-row">
        <input type="text" id="repo-path-input" placeholder="/chemin/vers/loop-engine" value="${currentRepoPath ? escapeHtml(currentRepoPath) : ""}" />
        <button id="browse-btn" class="ghost">Parcourir…</button>
      </div>
      <div class="settings-actions">
        <button id="save-btn" class="primary">Enregistrer</button>
        ${canGoBack ? `<button id="back-btn" class="ghost">Retour</button>` : ""}
      </div>
      <div id="settings-error" class="error-text"></div>
    </div>
  `;

  const input = root.querySelector<HTMLInputElement>("#repo-path-input")!;
  const errorEl = root.querySelector<HTMLElement>("#settings-error")!;

  root.querySelector("#browse-btn")!.addEventListener("click", async () => {
    const picked = await window.loopGuiApi.pickRepoDirectory();
    if (picked) {
      input.value = picked;
    }
  });

  root.querySelector("#save-btn")!.addEventListener("click", async () => {
    errorEl.textContent = "";
    try {
      const config = await window.loopGuiApi.saveRepoPath(input.value);
      currentRepoPath = config.repoPath;
      nav = goToDashboard(nav);
      render();
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : "Erreur inconnue";
    }
  });

  const backBtn = root.querySelector("#back-btn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      nav = goToDashboard(nav);
      render();
    });
  }
}

function renderSplitView(root: HTMLElement): void {
  const selectedProject = nav.screen.name === "project-detail" ? nav.screen.project : null;

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

  root.querySelector("#settings-link")!.addEventListener("click", () => {
    nav = goToSettings(nav);
    render();
  });

  const rows = root.querySelector<HTMLElement>("#project-rows")!;
  for (const project of FIXTURE_PROJECTS) {
    const row = document.createElement("div");
    row.className = "project-row" + (project.name === selectedProject ? " selected" : "");
    row.innerHTML = `
      <div class="project-row-top">
        <span class="mono">${escapeHtml(project.name)}</span>
        ${healthBadge(project.health)}
      </div>
      <div class="project-row-bottom">${escapeHtml(project.git.branch)} · ${cleanBadge(project.git.clean)}</div>
    `;
    row.addEventListener("click", () => {
      nav = selectProject(nav, project.name);
      render();
    });
    rows.appendChild(row);
  }

  const detailPane = root.querySelector<HTMLElement>("#detail-pane")!;
  if (!selectedProject) {
    detailPane.innerHTML = `<div class="empty-state">Sélectionnez un projet dans la liste.</div>`;
    return;
  }
  renderProjectDetail(detailPane, selectedProject);
}

function renderProjectDetail(root: HTMLElement, projectName: string): void {
  const project = FIXTURE_PROJECTS.find((p) => p.name === projectName);
  const detail = FIXTURE_DETAIL[projectName];
  if (!project || !detail) {
    root.innerHTML = `<div class="empty-state">Projet inconnu : ${escapeHtml(projectName)}</div>`;
    return;
  }

  root.innerHTML = `
    <div class="detail-header">
      <h2>${escapeHtml(project.name)}</h2>
      ${healthBadge(project.health)}
      <span class="mono dim">${escapeHtml(project.path)}</span>
    </div>
    <div id="sections"></div>
  `;

  const sectionsRoot = root.querySelector<HTMLElement>("#sections")!;
  const state = sectionsFor(projectName);

  const sectionSpecs: Array<{ id: keyof typeof detail; title: string; kind: "text" | "json" }> = [
    { id: "status", title: "Statut", kind: "json" },
    { id: "next", title: "Prochaine action", kind: "json" },
    { id: "context", title: "Contexte", kind: "text" },
    { id: "prompt", title: "Prompt", kind: "text" },
    { id: "review", title: "Review", kind: "json" },
    { id: "plan", title: "Plan (prévisionnel)", kind: "json" },
  ];

  for (const spec of sectionSpecs) {
    sectionsRoot.appendChild(renderSection(projectName, spec.id, spec.title, spec.kind, state, detail[spec.id]));
  }
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
  const el = document.createElement("div");
  el.className = "section" + (isOpen ? " open" : "");
  el.innerHTML = `
    <div class="section-head">
      <span class="caret">▸</span>
      <strong>${escapeHtml(title)}</strong>
      ${EAGER_SECTIONS.includes(id) ? `<span class="eager-tag">auto</span>` : ""}
    </div>
    <div class="section-body"></div>
  `;
  const head = el.querySelector(".section-head")!;
  const body = el.querySelector<HTMLElement>(".section-body")!;

  if (isOpen) {
    if (kind === "text") {
      body.innerHTML = `<div class="text-panel mono"></div>`;
      body.querySelector(".text-panel")!.textContent = String(content);
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

  return el;
}

void boot();
