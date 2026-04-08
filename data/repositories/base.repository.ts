export abstract class BaseRepository<T> {
  constructor(protected database: any) {}

  abstract findById(id: number): Promise<T | null>;
  abstract findAll(): Promise<T[]>;
  abstract create(data: Partial<T>): Promise<T>;
  abstract update(id: number, data: Partial<T>): Promise<T>;
  abstract delete(id: number): Promise<void>;
}
