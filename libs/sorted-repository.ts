import {
  IItem,
  IPaginatedItems,
  IScoreRangeOptions,
  ISerializer,
  ISortedItemRepository,
  ISortedIterateOptions,
  ISortedRepositoryOptions,
  ISortedSetOptions,
  ScoreBound,
  SortOrder
} from './model'
import { Redis, Cluster } from 'ioredis'
import {
  assertId,
  assertInteger,
  assertNonNegativeInteger,
  assertPositiveInteger,
  createMsgpackSerializer,
  isCluster,
  nextScore,
  notNull,
  pageBounds,
  toBuffer
} from './utils'

type Command = [string, ...(string | number | Buffer)[]]

const DEFAULT_BATCH_SIZE = 100

export class SortedItemRepository<T> implements ISortedItemRepository<T> {
  private readonly keyPrefix: string
  private readonly hashPrefix: string
  private readonly serializer: ISerializer<T>
  private readonly maxItems?: number
  private readonly atomic: boolean

  constructor(
    public readonly name: string,
    public readonly redis: Redis | Cluster = new Redis(),
    options: ISortedRepositoryOptions<T> = {}
  ) {
    const namespace = options.hashTag ? `{${name}}` : name
    this.keyPrefix = `items:${namespace}:`
    this.hashPrefix = `items-data:${namespace}:`
    this.serializer = options.serializer ?? createMsgpackSerializer<T>()
    if (options.maxItems != null) {
      assertPositiveInteger(options.maxItems, 'maxItems')
      this.maxItems = options.maxItems
    }
    // without a hash tag, the index and data keys live in different cluster slots and cannot share a transaction
    this.atomic = !isCluster(redis) || options.hashTag === true
  }

  async set(item: IItem<T>, options: ISortedSetOptions = {}): Promise<void> {
    await this.setMany([item], options)
  }

  async setMany(items: IItem<T>[], options: ISortedSetOptions = {}): Promise<void> {
    if (items.length === 0) return
    items.forEach((item) => assertId(item.id))
    if (options.score != null && !Number.isFinite(options.score)) {
      throw new RangeError('score must be a finite number')
    }

    const keepScore = options.keepScore === true && options.score == null
    const fields = items.flatMap((item) => [item.id, toBuffer(this.serializer.encode(item))])
    const members = items.flatMap((item) => [options.score ?? nextScore(), item.id])

    // data is written before the index, so readers never find an indexed item without data
    await this.run([
      ['hset', this.hashPrefix, ...fields],
      ['zadd', this.keyPrefix, ...(keepScore ? ['NX'] : []), ...members]
    ])

    if (this.maxItems != null) {
      await this.trimToSize(this.maxItems)
    }
  }

  async getById(id: string): Promise<IItem<T> | null> {
    const payload = await this.redis.hgetBuffer(this.hashPrefix, id)

    return this.decode(payload)
  }

  async getByIds(ids: string[]): Promise<(IItem<T> | null)[]> {
    if (ids.length === 0) return []
    const buffers = await this.redis.hmgetBuffer(this.hashPrefix, ...ids)

    return buffers.map((b) => this.decode(b))
  }

  async getAll(): Promise<IItem<T>[]> {
    const ids = await this.redis.zrange(this.keyPrefix, 0, '-1')

    return this.fetch(ids)
  }

  async getItemScoreById(id: string): Promise<number | null> {
    const score = await this.redis.zscore(this.keyPrefix, id)

    return score === null ? null : Number(score)
  }

  async getItemsByScore(min: ScoreBound, max: ScoreBound, options: IScoreRangeOptions = {}): Promise<IItem<T>[]> {
    const { offset = 0, limit, order = 'asc' } = options
    assertNonNegativeInteger(offset, 'offset')
    if (limit != null) {
      assertNonNegativeInteger(limit, 'limit')
      if (limit === 0) return []
    }

    const limitArgs = ['LIMIT', offset, limit ?? -1] as const
    const ids =
      order === 'desc'
        ? await this.redis.zrevrangebyscore(this.keyPrefix, max, min, ...limitArgs)
        : await this.redis.zrangebyscore(this.keyPrefix, min, max, ...limitArgs)

    return this.fetch(ids)
  }

  async getPaginated(page: number, pageSize: number, order: SortOrder = 'asc'): Promise<IPaginatedItems<T>> {
    const [start, end] = pageBounds(page, pageSize)
    // count and range are read in one transaction, so they are consistent
    const tx = this.redis.multi().zcard(this.keyPrefix)
    if (order === 'desc') {
      tx.zrevrange(this.keyPrefix, start, end)
    } else {
      tx.zrange(this.keyPrefix, start, String(end))
    }
    const [count, ids] = (await this.exec(tx)) as [number, string[]]

    return {
      items: await this.fetch(ids),
      count
    }
  }

  async *iterate(options: ISortedIterateOptions = {}): AsyncIterableIterator<IItem<T>> {
    const { batchSize = DEFAULT_BATCH_SIZE, order = 'asc' } = options
    assertPositiveInteger(batchSize, 'batchSize')

    for (let start = 0; ; start += batchSize) {
      const end = start + batchSize - 1
      const ids =
        order === 'desc'
          ? await this.redis.zrevrange(this.keyPrefix, start, end)
          : await this.redis.zrange(this.keyPrefix, start, String(end))
      for (const item of await this.fetch(ids)) {
        yield item
      }
      if (ids.length < batchSize) return
    }
  }

  async deletePage(page: number, pageSize: number): Promise<void> {
    const [start, end] = pageBounds(page, pageSize)
    const ids = await this.redis.zrange(this.keyPrefix, start, String(end))
    await this.deleteByIds(ids)
  }

  async hasItem(id: string): Promise<boolean> {
    return (await this.redis.hexists(this.hashPrefix, id)) === 1
  }

  async deleteById(id: string): Promise<void> {
    await this.deleteByIds([id])
  }

  async deleteByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0

    // the index is cleaned before the data, so readers never find an indexed item without data
    const [removed, deleted] = (await this.run([
      ['zrem', this.keyPrefix, ...ids],
      ['hdel', this.hashPrefix, ...ids]
    ])) as [number, number]

    return Math.max(removed, deleted)
  }

  async deleteByScore(min: ScoreBound, max: ScoreBound): Promise<number> {
    const ids = await this.redis.zrangebyscore(this.keyPrefix, min, max)

    return this.deleteByIds(ids)
  }

  async trimToSize(maxItems: number): Promise<number> {
    assertNonNegativeInteger(maxItems, 'maxItems')
    const ids = await this.redis.zrange(this.keyPrefix, 0, String(-(maxItems + 1)))

    return this.deleteByIds(ids)
  }

  async count(): Promise<number> {
    const count = await this.redis.zcard(this.keyPrefix)

    return count
  }

  async deleteAll(): Promise<void> {
    await this.run([
      ['del', this.keyPrefix],
      ['del', this.hashPrefix]
    ])
  }

  async getFirstNItems(n: number): Promise<IItem<T>[]> {
    assertNonNegativeInteger(n, 'n')
    if (n === 0) return []
    const ids = await this.redis.zrange(this.keyPrefix, 0, String(n - 1))

    return this.fetch(ids)
  }

  async getLastNItems(n: number): Promise<IItem<T>[]> {
    assertNonNegativeInteger(n, 'n')
    if (n === 0) return []
    const ids = await this.redis.zrevrange(this.keyPrefix, 0, n - 1)

    return (await this.fetch(ids)).reverse()
  }

  async getItemsInRange(start: number, end: number): Promise<IItem<T>[]> {
    assertInteger(start, 'start')
    assertInteger(end, 'end')
    const ids = await this.redis.zrange(this.keyPrefix, start, String(end))

    return this.fetch(ids)
  }

  async existsInRange(min: ScoreBound, max: ScoreBound): Promise<boolean> {
    const count = await this.redis.zcount(this.keyPrefix, min, max)

    return count > 0
  }

  async getNextNItemsGreaterThanScore(score: number, n: number): Promise<IItem<T>[]> {
    assertNonNegativeInteger(n, 'n')
    if (n === 0) return []
    const ids = await this.redis.zrangebyscore(this.keyPrefix, `(${score}`, '+inf', 'LIMIT', 0, n)

    return this.fetch(ids)
  }

  private decode(buffer: Buffer | null): IItem<T> | null {
    return buffer ? this.serializer.decode(buffer) : null
  }

  // Loads the data of indexed ids, skipping ids whose data is missing.
  private async fetch(ids: string[]): Promise<IItem<T>[]> {
    return (await this.getByIds(ids)).filter(notNull)
  }

  /**
   * Runs commands touching the index and data keys. They run as a MULTI transaction, unless the keys live in
   * different Redis Cluster slots: then they run sequentially in the given order.
   */
  private async run(commands: Command[]): Promise<unknown[]> {
    if (this.atomic) {
      return this.exec(this.redis.multi(commands))
    }

    const results: unknown[] = []
    for (const [command, ...args] of commands) {
      results.push(await this.redis.call(command, ...args))
    }

    return results
  }

  private async exec(tx: ReturnType<Redis['multi']>): Promise<unknown[]> {
    const results = await tx.exec()
    if (!results) throw new Error('Redis transaction aborted')

    return results.map(([err, result]) => {
      if (err) throw err
      return result
    })
  }
}

export default SortedItemRepository
