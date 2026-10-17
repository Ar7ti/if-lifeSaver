import type { WorkspacePatch, WorkspaceWidget } from '@contracts';

export const byPosition = (a: WorkspaceWidget, b: WorkspaceWidget) => a.position.y - b.position.y || a.position.x - b.position.x;

/**
 * Re-flows an ordered list of widgets into the server's 12-column grid and returns a patch
 * for the widgets whose position changed. Heights are kept; rows are packed left to right.
 */
export function reflow(ordered: { widget: WorkspaceWidget; w: number }[]): WorkspacePatch['widgets'] {
  const patch: WorkspacePatch['widgets'] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const { widget, w } of ordered) {
    if (x + w > 12) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    const h = widget.position.h;
    const next = { x, y: Math.min(y, 100), w, h };
    const p = widget.position;
    if (p.x !== next.x || p.y !== next.y || p.w !== next.w) patch.push({ id: widget.id, position: next });
    x += w;
    rowH = Math.max(rowH, h);
  }
  return patch;
}

/** Calm reading order: money first, then what to do, then what to buy, then the rest. */
const RECOMMENDED: { type: WorkspaceWidget['type']; w: number }[] = [
  { type: 'budget', w: 12 },
  { type: 'recommendations', w: 12 },
  { type: 'product_catalog', w: 12 },
  { type: 'task_list', w: 6 },
  { type: 'shopping_cart', w: 6 },
  { type: 'service_finder', w: 12 },
  { type: 'scenario_comparison', w: 12 },
  { type: 'risk_guardian', w: 6 },
  { type: 'timeline', w: 6 },
];

/** A patch that re-flows the workspace into the recommended order. Visibility is untouched. */
export function recommendedPatch(widgets: WorkspaceWidget[]): WorkspacePatch['widgets'] {
  const rank = (w: WorkspaceWidget) => {
    const i = RECOMMENDED.findIndex(r => r.type === w.type);
    return i === -1 ? RECOMMENDED.length : i;
  };
  const ordered = [...widgets].sort((a, b) => rank(a) - rank(b) || byPosition(a, b));
  const visible = ordered.filter(w => w.visible);
  const hidden = ordered.filter(w => !w.visible);
  return reflow([...visible, ...hidden].map(w => ({ widget: w, w: RECOMMENDED.find(r => r.type === w.type)?.w ?? w.position.w })));
}
