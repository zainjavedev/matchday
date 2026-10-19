export const titleOf = (e) =>
  e.kind === 'session' ? `F1 · ${e.raceName} — ${e.session}` : e.sides.map((s) => s.short).join(' vs ');
