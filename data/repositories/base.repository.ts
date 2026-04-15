import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export abstract class BaseRepository<T> {
  constructor(protected readonly database: Queryable) {}

  protected query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params: ReadonlyArray<unknown> = [],
  ): Promise<QueryResult<R>> {
    return this.database.query<R>(text, params);
  }

  abstract findById(id: number): Promise<T | null>;
  abstract findAll(): Promise<T[]>;
  abstract create(data: Partial<T>): Promise<T>;
  abstract update(id: number, data: Partial<T>): Promise<T>;
  abstract delete(id: number): Promise<void>;
}
