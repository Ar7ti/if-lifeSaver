import { randomUUID } from 'node:crypto';
import { WorkspaceSchema, type Workspace, type WorkspacePatch, type WorkspaceWidget } from '../../shared/contracts/index.js';
import { AppError, notFound } from './errors.js';

const definitions: Record<WorkspaceWidget['type'], { title: string; dataRef: WorkspaceWidget['dataRef'] }> = {
  budget:{title:'Moving budget',dataRef:'budget'}, product_catalog:{title:'Furniture and essentials',dataRef:'researchResults'}, shopping_cart:{title:'Your moving plan',dataRef:'cart'}, service_finder:{title:'Moving services',dataRef:'researchResults'}, scenario_comparison:{title:'Compare your options',dataRef:'scenarios'}, risk_guardian:{title:'Life Risk Guardian',dataRef:'risks'}, timeline:{title:'Moving timeline',dataRef:'tasks'}, recommendations:{title:'Suggested next steps',dataRef:'recommendations'}, task_list:{title:'Moving checklist',dataRef:'tasks'},
};
export function createWorkspace(title: string, types: WorkspaceWidget['type'][]): Workspace {
  const selected = [...new Set(types.length ? types : Object.keys(definitions) as WorkspaceWidget['type'][])];
  return WorkspaceSchema.parse({id:randomUUID(),version:1,title,widgets:selected.map((type,index) => ({id:randomUUID(),type,...definitions[type],position:{x:index%2*6,y:Math.floor(index/2)*4,w:6,h:4},visible:true,config:{}})),updatedAt:new Date().toISOString()});
}
export function patchWorkspace(workspace: Workspace, patch: WorkspacePatch) {
  if (new Set(patch.widgets.map(w => w.id)).size !== patch.widgets.length) throw new AppError('VALIDATION_ERROR','Duplicate widget IDs');
  for (const update of patch.widgets) {
    const widget = workspace.widgets.find(w => w.id === update.id);
    if (!widget) throw notFound('Workspace widget');
    const {id, ...changes} = update;
    Object.assign(widget,changes);
  }
  workspace.updatedAt = new Date().toISOString();
  WorkspaceSchema.parse(workspace);
}
