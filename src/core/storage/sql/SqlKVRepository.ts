import { Field, Schema } from '@waha/core/storage/Schema';
import { IJsonQuery } from '@waha/core/storage/sql/IJsonQuery';
import { ISQLEngine } from '@waha/core/storage/sql/ISQLEngine';
import { PaginationParams } from '@waha/structures/pagination.dto';
import { KnexPaginator } from '@waha/utils/Paginator';
import Knex from 'knex';
import * as lodash from 'lodash';

export type Migration = string;

export class SqlKVRepository<Entity> {
  protected UPSERT_BATCH_SIZE = 100;
  protected Paginator: typeof KnexPaginator = KnexPaginator;

  protected jsonQuery: IJsonQuery;

  get schema(): Schema {
    throw new Error('Not implemented');
  }

  get metadata(): Map<string, (entity: Entity) => any> {
    return new Map();
  }

  get migrations(): Migration[] {
    return [];
  }

  constructor(
    private engine: ISQLEngine,
    protected knex: Knex.Knex,
  ) {}

  get columns(): Field[] {
    return this.schema.columns;
  }

  get table(): string {
    return this.schema.name;
  }

  /**
   * Migrations
   */
  async init(): Promise<void> {
    await this.applyMigrations();
    await this.validateSchema();
  }

  protected async applyMigrations() {
    for (const migration of this.migrations) {
      await this.engine.exec(migration);
    }
  }

  protected async validateSchema() {
    return;
  }

  /**
   * Update methods
   */
  save(entity: Entity) {
    return this.upsertOne(entity);
  }

  async upsertOne(entity: Entity): Promise<void> {
    await this.upsertMany([entity]);
  }

  async upsertMany(entities: Entity[]): Promise<void> {
    if (entities.length === 0) {
      return;
    }
    const batchSize = this.UPSERT_BATCH_SIZE;
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);
      await this.upsertBatch(batch);
    }
  }

  private async upsertBatch(entities: Entity[]): Promise<void> {
    const all = entities.map((entity) => this.dump(entity));
    // make it unique by .id
    const data = lodash.uniqBy(all, (d: any) => d.id);
    if (data.length != all.length) {
      console.warn(
        `WARNING - Duplicated entities for upsert batch: ${JSON.stringify(
          entities,
        )}`,
      );
    }
    const columns = this.columns.map((c) => `"${c.fieldName}"`);
    const values = data.map((d) => Object.values(d)).flat();
    const sql = `INSERT INTO "${this.table}" (${columns.join(', ')})
                 VALUES ${data
                   .map(() => `(${columns.map(() => '?').join(', ')})`)
                   .join(', ')}
                 ON CONFLICT(id) DO UPDATE
                     SET ${columns
                       .map((column) => `${column} = excluded.${column}`)
                       .join(', ')}`;
    try {
      await this.raw(sql, values);
    } catch (err) {
      console.error(
        `Error upserting data: ${err}, sql: ${sql}, values: ${values}`,
      );
      throw err;
    }
  }

  /**
   * Get methods
   */
  getAll(pagination?: PaginationParams) {
    let query = this.select();
    query = this.pagination(query, pagination);
    return this.all(query);
  }

  async getAllByIds(ids: string[]) {
    const entitiesMap = await this.getEntitiesByIds(ids);
    return Array.from(entitiesMap.values()).filter(
      (entity) => entity !== null,
    ) as Entity[];
  }

  async getEntitiesByIds(ids: string[]): Promise<Map<string, Entity | null>> {
    if (ids.length === 0) {
      return new Map();
    }

    const rows = await this.engine.all(this.select().whereIn('id', ids));
    const entitiesMap = new Map<string, Entity | null>();

    // Initialize a map with null values for all requested IDs
    for (const id of ids) {
      entitiesMap.set(id, null);
    }

    // Fill in the map with found entities
    for (const row of rows) {
      if (row && row.id) {
        entitiesMap.set(row.id, this.parse(row));
      }
    }

    return entitiesMap;
  }

  getById(id: string): Promise<Entity | null> {
    return this.getBy({ id: id });
  }

  getAllBy(filters: any) {
    const query = this.select().where(filters);
    return this.all(query);
  }

  public async getBy(filters: any) {
    const query = this.select().where(filters).limit(1);
    return this.get(query);
  }

  /**
   * Delete methods
   */
  async deleteAll() {
    const query = this.delete();
    await this.run(query);
  }

  async deleteById(id: string) {
    await this.deleteBy({ id: id });
  }

  public async deleteBy(filters: any) {
    const query = this.delete().where(filters);
    await this.run(query);
  }

  /**
   * SQL Implementation details
   */
  public async raw(sql: string, bindings: any[]): Promise<void> {
    await this.engine.raw(sql, bindings);
  }

  protected async run(query: Knex.QueryBuilder): Promise<void> {
    await this.engine.run(query);
  }

  protected async get(query: Knex.QueryBuilder): Promise<Entity | null> {
    const row = await this.engine.get(query);
    if (!row) {
      return null;
    }
    return this.parse(row);
  }

  public async all(query: Knex.QueryBuilder): Promise<Entity[]> {
    const rows = await this.engine.all(query);
    return rows.map((row) => this.parse(row));
  }

  /**
   * SQL helpers
   */
  public select() {
    return this.knex.select().from(this.table);
  }

  protected delete() {
    return this.knex.delete().from(this.table);
  }

  public pagination(query: any, pagination?: PaginationParams) {
    const paginator = new this.Paginator(pagination, this.jsonQuery);
    return paginator.apply(query);
  }

  /**
   * JSON helpers
   */
  public filterJson(field: string, key: string, value: any): [string, string] {
    return this.jsonQuery.filter(field, key, value);
  }

  protected stringify(data: any): string {
    return JSON.stringify(data);
  }

  protected parse(row: any) {
    return JSON.parse(row.data);
  }

  protected dump(entity: Entity) {
    const data = {};
    const raw = entity;
    for (const field of this.columns) {
      const fn = this.metadata.get(field.fieldName);
      if (fn) {
        data[field.fieldName] = fn(raw);
      } else if (field.fieldName == 'data') {
        data['data'] = this.stringify(raw);
      } else {
        data[field.fieldName] = raw[field.fieldName] ?? null;
      }
    }
    return data;
  }
}
