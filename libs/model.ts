import { Redis, Cluster } from 'ioredis'

export interface IItem<T> {
  id: string
  data: T
}

export interface IPaginatedItems<T> {
  items: IItem<T>[]
  count: number
}

/**
 * ISerializer converts items to and from the binary payload stored in Redis.
 * The default serializer uses MessagePack.
 */
export interface ISerializer<T> {
  encode: (item: IItem<T>) => Buffer | Uint8Array
  decode: (buffer: Buffer) => IItem<T>
}

export interface IRepositoryOptions<T> {
  /**
   * Custom serializer used to encode/decode items. Defaults to MessagePack.
   */
  serializer?: ISerializer<T>
}

export interface ISortedRepositoryOptions<T> extends IRepositoryOptions<T> {
  /**
   * Wraps the repository name in a Redis Cluster hash tag (`items:{name}:`), so the index and the data keys
   * live in the same slot and multi-key writes run as atomic transactions on Redis Cluster.
   * Changes the key layout: data stored without this option is not visible with it, and vice versa.
   */
  hashTag?: boolean

  /**
   * Maximum number of items to keep. When exceeded after a write, the lowest scored (oldest) items are removed.
   */
  maxItems?: number
}

export interface ISortedSetOptions {
  /**
   * Explicit score for the item. Defaults to a wall-clock based, monotonically increasing score.
   */
  score?: number

  /**
   * When true and no explicit score is given, an existing item keeps its current score (and position) on update.
   */
  keepScore?: boolean
}

export type SortOrder = 'asc' | 'desc'

export type ScoreBound = number | '-inf' | '+inf'

export interface IScoreRangeOptions {
  /**
   * Number of matching items to skip.
   */
  offset?: number

  /**
   * Maximum number of items to return.
   */
  limit?: number

  /**
   * Sort order of the result, ascending by default.
   */
  order?: SortOrder
}

export interface IIterateOptions {
  /**
   * Number of items fetched from Redis per round trip. Defaults to 100.
   */
  batchSize?: number
}

export interface ISortedIterateOptions extends IIterateOptions {
  /**
   * Iteration order, ascending by default.
   */
  order?: SortOrder
}

export interface IItemRepository<T> {
  name: string
  redis: Redis | Cluster
  set: (item: IItem<T>, expirationInSeconds?: number) => Promise<void>
  getById: (id: string) => Promise<IItem<T> | null>
  getAll: () => Promise<IItem<T>[]>
  getPaginated: (page: number, pageSize: number) => Promise<IPaginatedItems<T>>
  hasItem: (id: string) => Promise<boolean>
  deleteById: (id: string) => Promise<void>
  deleteAll: () => Promise<void>
  count: () => Promise<number>

  /**
   * Sets multiple items in one round trip.
   * @param items - The items to store.
   * @param expirationInSeconds - Optional expiration applied to every item.
   */
  setMany: (items: IItem<T>[], expirationInSeconds?: number) => Promise<void>

  /**
   * Retrieves multiple items by ID. The result is aligned with the input: missing items are null.
   */
  getByIds: (ids: string[]) => Promise<(IItem<T> | null)[]>

  /**
   * Deletes multiple items by ID.
   * @returns The number of items deleted.
   */
  deleteByIds: (ids: string[]) => Promise<number>

  /**
   * Iterates over all items in batches without loading the whole repository in memory. Order is not guaranteed.
   */
  iterate: (options?: IIterateOptions) => AsyncIterableIterator<IItem<T>>

  /**
   * Retrieves the remaining time to live of an item.
   * @returns Seconds to live, -1 if the item does not expire, null if the item does not exist.
   */
  getTtl: (id: string) => Promise<number | null>

  /**
   * Sets an expiration on an existing item.
   * @returns true if the item exists and the expiration was set.
   */
  expire: (id: string, expirationInSeconds: number) => Promise<boolean>

  /**
   * Removes the expiration of an item.
   * @returns true if the expiration was removed.
   */
  persist: (id: string) => Promise<boolean>
}

/**
 * ISortedItemRepository is an interface that defines the methods for interacting with a
 * sorted item repository that uses Redis as the storage system.
 */
export interface ISortedItemRepository<T> {
  name: string
  redis: Redis | Cluster

  /**
   * Sets an item in the repository.
   * @param item - The item to be added.
   * @param options - Optional explicit score, or keepScore to preserve the position of an existing item.
   */
  set: (item: IItem<T>, options?: ISortedSetOptions) => Promise<void>

  /**
   * Retrieves an item from the repository by its ID.
   * @param id - The ID of the item to retrieve.
   * @returns The item if found, null otherwise.
   */
  getById: (id: string) => Promise<IItem<T> | null>

  /**
   * Retrieves all items from the repository.
   * @returns An array of all items in the repository.
   */
  getAll: () => Promise<IItem<T>[]>

  /**
   * Retrieves a paginated set of items from the repository.
   * @param page - The page number to retrieve (starting at 1).
   * @param pageSize - The number of items per page.
   * @param order - Sort order, ascending by default.
   * @returns An object containing the paginated items and the total count of items.
   */
  getPaginated: (page: number, pageSize: number, order?: SortOrder) => Promise<IPaginatedItems<T>>

  /**
   * Retrieves the score of an item by its ID.
   * @param id - The ID of the item.
   * @returns The score of the item if found, null otherwise.
   */
  getItemScoreById: (id: string) => Promise<number | null>

  /**
   * Retrieves items by their scores within a specified range.
   * @param min - The minimum score value.
   * @param max - The maximum score value.
   * @param options - Optional offset, limit and order.
   * @returns An array of items with scores within the specified range.
   */
  getItemsByScore: (min: ScoreBound, max: ScoreBound, options?: IScoreRangeOptions) => Promise<IItem<T>[]>

  /**
   * Deletes a page of items from the repository.
   * @param page - The page number of items to delete.
   * @param pageSize - The number of items per page.
   */
  deletePage: (page: number, pageSize: number) => Promise<void>

  /**
   * Checks if an item exists in the repository by its ID.
   * @param id - The ID of the item.
   * @returns A boolean indicating whether the item exists.
   */
  hasItem: (id: string) => Promise<boolean>

  /**
   * Deletes an item from the repository by its ID.
   * @param id - The ID of the item to delete.
   */
  deleteById: (id: string) => Promise<void>

  /**
   * Deletes all items from the repository.
   */
  deleteAll: () => Promise<void>

  /**
   * Retrieves the count of items in the repository.
   * @returns The count of items.
   */
  count: () => Promise<number>

  /**
   * Retrieves the first N items from the repository.
   * @param n - The number of items to retrieve.
   * @returns An array of the first N items.
   */
  getFirstNItems: (n: number) => Promise<IItem<T>[]>

  /**
   * Retrieves the last N items from the repository.
   * @param n - The number of items to retrieve.
   * @returns An array of the last N items.
   */
  getLastNItems: (n: number) => Promise<IItem<T>[]>

  /**
   * Retrieves items within a specified index range.
   * @param start - The starting index.
   * @param end - The ending index.
   *
   * @returns An array of items within the specified index range.
   */
  getItemsInRange: (start: number, end: number) => Promise<IItem<T>[]>

  /**
   *
   * Checks if any items exist within a specified score range.
   * @param min - The minimum score value.
   * @param max - The maximum score value.
   * @returns A boolean indicating whether any items exist within the specified score range.
   */
  existsInRange: (min: ScoreBound, max: ScoreBound) => Promise<boolean>

  /**
   *
   * Retrieves the next N items with scores greater than a specified score.
   * @param score - The score to compare.
   * @param n - The number of items to retrieve.
   * @returns An array of the next N items with scores greater than the specified score.
   */
  getNextNItemsGreaterThanScore: (score: number, n: number) => Promise<IItem<T>[]>

  /**
   * Sets multiple items in one round trip. Items without an explicit score keep the input order.
   */
  setMany: (items: IItem<T>[], options?: ISortedSetOptions) => Promise<void>

  /**
   * Retrieves multiple items by ID. The result is aligned with the input: missing items are null.
   */
  getByIds: (ids: string[]) => Promise<(IItem<T> | null)[]>

  /**
   * Deletes multiple items by ID.
   * @returns The number of items deleted.
   */
  deleteByIds: (ids: string[]) => Promise<number>

  /**
   * Iterates over all items in score order, in batches, without loading the whole repository in memory.
   */
  iterate: (options?: ISortedIterateOptions) => AsyncIterableIterator<IItem<T>>

  /**
   * Deletes all items with scores within the specified range.
   * @returns The number of items deleted.
   */
  deleteByScore: (min: ScoreBound, max: ScoreBound) => Promise<number>

  /**
   * Removes the lowest scored (oldest) items so that at most maxItems remain.
   * @returns The number of items deleted.
   */
  trimToSize: (maxItems: number) => Promise<number>
}
