import { SqlKVRepository } from '@waha/core/storage/sql/SqlKVRepository';
import { Sqlite3Engine } from '@waha/core/storage/sqlite3/Sqlite3Engine';
import { Sqlite3JsonQuery } from '@waha/core/storage/sqlite3/Sqlite3JsonQuery';
import { Database } from 'better-sqlite3';
import Knex from 'knex';

/**
 * Key value repository with extra metadata
 */
export class Sqlite3KVRepository<Entity> extends SqlKVRepository<Entity> {
  protected db: Database;
  protected jsonQuery = new Sqlite3JsonQuery();

  constructor(db: Database) {
    // sqlite does not support inserting default values. Set the `useNullAsDefault` flag to hide this warning. (see docs https://knexjs.org/guide/query-builder.html#insert).
    const knex = Knex({ client: 'better-sqlite3', useNullAsDefault: true });
    const engine = new Sqlite3Engine(db);
    super(engine, knex);
    this.db = db;
  }
}
