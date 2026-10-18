import { mkdir, readFile, rename, writeFile, unlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { IdSchema, LifeProjectSchema, type LifeProject } from '../../shared/contracts/index.js';
import { AppError, notFound } from './errors.js';
import { accessContext } from './access-context.js';
type StoredProject = { format: 1; ownerId: string; project: LifeProject };
function decode(raw: unknown): StoredProject {
  const value=(raw&&typeof raw==='object'?raw:{}) as Partial<StoredProject>;
  const ownerId=value.format===1?value.ownerId:'legacy-admin';
  const principal=accessContext.getStore()?.principal;
  // Reject private/legacy records before validating or using their project payload.
  if(principal?.role==='anonymous'&&ownerId!==principal.id)throw notFound('Project');
  if(value.format===1){
    if(typeof value.ownerId!=='string'||!value.ownerId)throw new Error('Missing project ownership');
    return {format:1,ownerId:value.ownerId,project:LifeProjectSchema.parse(value.project)};
  }
  return {format:1,ownerId:'legacy-admin',project:LifeProjectSchema.parse(raw)};
}

export interface ProjectRepository {
  readonly mode: 'local' | 'memory';
  ready(): Promise<void>;
  create(project: LifeProject): Promise<LifeProject>;
  get(id: string): Promise<LifeProject>;
  update(id: string, change: (project: LifeProject) => Promise<void> | void, expectedRevision?: number): Promise<LifeProject>;
  enableAccessControl?(maxProjects:number):void;
  list?():Promise<LifeProject[]>;
}
abstract class BaseRepository implements ProjectRepository {
  abstract readonly mode: 'local' | 'memory';
  private locks = new Map<string, Promise<unknown>>();
  private accessControlled=false;
  private maxProjects=5;
  enableAccessControl(maxProjects:number){this.accessControlled=true;this.maxProjects=maxProjects;}
  abstract ready(): Promise<void>;
  protected abstract read(id: string): Promise<StoredProject | null>;
  protected abstract write(record: StoredProject): Promise<void>;
  protected abstract ids():Promise<string[]>;
  private principal(){
    const principal=accessContext.getStore()?.principal;
    if(this.accessControlled&&!principal)throw new AppError('SESSION_REQUIRED','A private session is required.',401);
    return principal;
  }
  private allowed(record:StoredProject){const principal=this.principal();return this.accessControlled?(principal?.role==='admin'||record.ownerId===principal?.id):record.ownerId==='legacy-admin';}
  async list(){
    this.principal();const projects:LifeProject[]=[];
    for(const id of await this.ids()){
      try{const record=await this.read(id);if(record&&this.allowed(record))projects.push(structuredClone(record.project));}
      catch(error){if(error instanceof AppError&&error.statusCode===404)continue;throw error;}
    }
    return projects.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  }
  private async serial<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(action);
    this.locks.set(id, next);
    try { return await next; } finally { if (this.locks.get(id) === next) this.locks.delete(id); }
  }
  async get(id: string) {
    IdSchema.parse(id);
    this.principal();const record = await this.read(id);
    if (!record||!this.allowed(record)) throw notFound('Project');
    return structuredClone(record.project);
  }
  async create(project: LifeProject) {
    return this.serial('__create__', async () => {
      const principal=this.principal();
      if(this.accessControlled&&principal?.role!=='admin'&&(await this.list()).length>=this.maxProjects)throw new AppError('WORKSPACE_LIMIT','Your private session has reached its workspace limit.',429);
      const value = LifeProjectSchema.parse(project);
      if (await this.read(value.id)) throw new AppError('CONFLICT','Project already exists',409);
      await this.write({format:1,ownerId:principal?.id??'legacy-admin',project:value});
      return structuredClone(value);
    });
  }
  async update(id: string, change: (project: LifeProject) => Promise<void> | void, expectedRevision?: number) {
    return this.serial(id, async () => {
      const project = await this.get(id);
      if (expectedRevision !== undefined && expectedRevision !== project.revision) throw new AppError('CONFLICT','Project changed; reload before applying your update',409,{revision:project.revision});
      await change(project);
      project.revision += 1;
      project.updatedAt = new Date().toISOString();
      const value = LifeProjectSchema.parse(project);
      const record=await this.read(id);
      if(!record||!this.allowed(record))throw notFound('Project');
      await this.write({...record,project:value});
      return structuredClone(value);
    });
  }
}
export class MemoryProjectRepository extends BaseRepository {
  readonly mode = 'memory' as const;
  private projects = new Map<string, StoredProject>();
  async ready() {}
  protected async read(id: string) { return this.projects.has(id) ? structuredClone(this.projects.get(id)!) : null; }
  protected async write(record: StoredProject) { this.projects.set(record.project.id, structuredClone(record)); }
  protected async ids(){return [...this.projects.keys()];}
}
/** Atomic files plus an in-process per-project write queue. Use one server process. */
export class LocalProjectRepository extends BaseRepository {
  readonly mode = 'local' as const;
  constructor(private directory: string) { super(); }
  async ready() { await mkdir(this.directory,{recursive:true,mode:0o700}); }
  private filename(id: string) { return path.join(this.directory,`${IdSchema.parse(id)}.json`); }
  protected async read(id: string) {
    try { return decode(JSON.parse(await readFile(this.filename(id),'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      if(error instanceof AppError&&error.statusCode===404)throw error;
      throw new AppError('STORAGE_ERROR','Stored project could not be read',503);
    }
  }
  protected async ids(){await this.ready();return (await readdir(this.directory)).filter(name=>name.endsWith('.json')&&IdSchema.safeParse(name.slice(0,-5)).success).map(name=>name.slice(0,-5));}
  protected async write(record: StoredProject) {
    await this.ready();
    const filename = this.filename(record.project.id);
    const temp = `${filename}.${randomUUID()}.tmp`;
    try { await writeFile(temp,JSON.stringify(record.ownerId==='legacy-admin'?record.project:record),{mode:0o600,flag:'wx'}); await rename(temp,filename); }
    catch { await unlink(temp).catch(() => {}); throw new AppError('STORAGE_ERROR','Project could not be saved',503); }
  }
}
