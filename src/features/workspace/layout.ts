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
