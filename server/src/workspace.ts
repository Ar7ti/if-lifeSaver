import { randomUUID } from 'node:crypto';
import { WorkspaceSchema, type Workspace, type WorkspacePatch, type WorkspaceWidget, type ScenarioType } from '../../shared/contracts/index.js';
import { AppError, notFound } from './errors.js';

const definitions: Record<WorkspaceWidget['type'], { title: string; dataRef: WorkspaceWidget['dataRef'] }> = {
  budget:{title:'Budget',dataRef:'budget'}, product_catalog:{title:'Product research',dataRef:'researchResults'}, shopping_cart:{title:'Planning cart',dataRef:'cart'}, service_finder:{title:'Relevant services',dataRef:'researchResults'}, scenario_comparison:{title:'Compare your options',dataRef:'scenarios'}, risk_guardian:{title:'Life Risk Guardian',dataRef:'risks'}, timeline:{title:'Timeline',dataRef:'tasks'}, recommendations:{title:'Suggested next steps',dataRef:'recommendations'}, task_list:{title:'Checklist',dataRef:'tasks'},
};
export function createWorkspace(title: string, types: WorkspaceWidget['type'][], scenarioType: ScenarioType = 'other'): Workspace {
  const selected = [...new Set(types.length ? types : ['task_list','recommendations'] as WorkspaceWidget['type'][])];
  const names:Partial<Record<WorkspaceWidget['type'],string>> = scenarioType==='moving'?{service_finder:'Moving services',timeline:'Moving timeline',task_list:'Moving checklist'}:scenarioType==='travel'?{service_finder:'Transport and stays',timeline:'Trip itinerary'}:scenarioType==='car_purchase'?{product_catalog:'Vehicle research',service_finder:'Vehicle services'}:scenarioType==='home_furnishing'?{product_catalog:'Furniture research',service_finder:'Delivery and assembly'}:scenarioType==='student_life'?{timeline:'Student timeline',service_finder:'Study and living services'}:{};
  return WorkspaceSchema.parse({id:randomUUID(),version:1,title,widgets:selected.map((type,index) => ({id:randomUUID(),type,...definitions[type],title:names[type]??definitions[type].title,position:{x:index%2*6,y:Math.floor(index/2)*4,w:6,h:4},visible:true,config:{}})),updatedAt:new Date().toISOString()});
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
