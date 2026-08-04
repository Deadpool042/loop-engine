// Pure reducer for the collapsible sections on the Détail projet panel.
// Mirrors decisions 12bis/13/14 from docs/architecture/gui-cockpit.md:
// status + next open eagerly, the rest starts collapsed, each section
// toggles independently. No content fetching here — Lot 1 renders static
// fixtures only (see fixtures.ts); wiring to real CLI calls is a later lot.

export const SECTION_IDS = ["status", "next", "context", "prompt", "review", "plan"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const EAGER_SECTIONS: readonly SectionId[] = ["status", "next"];

export interface SectionsState {
  readonly open: Readonly<Record<SectionId, boolean>>;
}

export function initialSections(): SectionsState {
  const open = {} as Record<SectionId, boolean>;
  for (const id of SECTION_IDS) {
    open[id] = EAGER_SECTIONS.includes(id);
  }
  return { open };
}

export function toggleSection(state: SectionsState, id: SectionId): SectionsState {
  if (!SECTION_IDS.includes(id)) {
    throw new TypeError(`unknown section id: ${String(id)}`);
  }
  return { open: { ...state.open, [id]: !state.open[id] } };
}

export function isOpen(state: SectionsState, id: SectionId): boolean {
  return state.open[id];
}
