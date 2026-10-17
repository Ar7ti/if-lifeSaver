import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { IdSchema, LifeProjectSchema, type LifeProject } from '../../shared/contracts/index.js';
import { AppError, notFound } from './errors.js';

export interface ProjectRepository {
  readonly mode: 'local' | 'memory';
  ready(): Promise<void>;
  create(project: LifeProject): Promise<LifeProject>;
  get(id: string): Promise<LifeProject>;
  update(id: string, change: (project: LifeProject) => Promise<void> | void, expectedRevision?: number): Promise<LifeProject>;
}
abstract class BaseRepository implements ProjectRepository {
  abstract readonly mode: 'local' | 'memory';
  private locks = new Map<string, Promise<unknown>>();
  abstract ready(): Promise<void>;
  protected abstract read(id: string): Promise<LifeProject | null>;
  protected abstract write(project: LifeProject): Promise<void>;
  private async serial<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(action);
    this.locks.set(id, next);
    try { return await next; } finally { if (this.locks.get(id) === next) this.locks.delete(id); }
  }
  async get(id: string) {
    IdSchema.parse(id);
    const project = await this.read(id);
    if (!project) throw notFound('Project');
    return structuredClone(project);
  }
  async create(project: LifeProject) {
    return this.serial(project.id, async () => {
      const value = LifeProjectSchema.parse(project);
      if (await this.read(value.id)) throw new AppError('CONFLICT','Project already exists',409);
      await this.write(value);
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
      await this.write(value);
      return structuredClone(value);
    });
  }
}
export class MemoryProjectRepository extends BaseRepository {
  readonly mode = 'memory' as const;
  private projects = new Map<string, LifeProject>();
  async ready() {}
  protected async read(id: string) { return this.projects.has(id) ? structuredClone(this.projects.get(id)!) : null; }
  protected async write(project: LifeProject) { this.projects.set(project.id, structuredClone(project)); }
}
/** Atomic files plus an in-process per-project write queue. Use one server process. */
export class LocalProjectRepository extends BaseRepository {
  readonly mode = 'local' as const;
  constructor(private directory: string) { super(); }
  async ready() { await mkdir(this.directory,{recursive:true,mode:0o700}); }
  private filename(id: string) { return path.join(this.directory,`${IdSchema.parse(id)}.json`); }
  protected async read(id: string) {
    try { return LifeProjectSchema.parse(JSON.parse(await readFile(this.filename(id),'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new AppError('STORAGE_ERROR','Stored project could not be read',503);
    }
  }
  protected async write(project: LifeProject) {
    await this.ready();
    const filename = this.filename(project.id);
    const temp = `${filename}.${randomUUID()}.tmp`;
    try { await writeFile(temp,JSON.stringify(project),{mode:0o600,flag:'wx'}); await rename(temp,filename); }
    catch { await unlink(temp).catch(() => {}); throw new AppError('STORAGE_ERROR','Project could not be saved',503); }
  }
}
