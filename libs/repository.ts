import Redis, { Cluster } from 'ioredis'
import { IItem, IItemRepository, IIterateOptions, IPaginatedItems, IRepositoryOptions, ISerializer } from './model'
import { decode } from '@msgpack/msgpack'
import {
  assertId,
  assertPositiveInteger,
  chunk,
  createMsgpackSerializer,
  escapeGlob,
  isCluster,
  notNull,
  pageBounds,
  toBuffer
} from './utils'

const DEFAULT_BATCH_SIZE = 100
const DELETE_CHUNK_SIZE = 500

export function bufferToItem<T>(buffer: Buffer | null): IItem<T> | null {
  if (!buffer) return null

  const item = decode(buffer) as IItem<T>
  return item
}

export class ItemRepository<T> implements IItemRepository<T> {
  private readonly keyPrefix: string
  private readonly matchPattern: string
  private readonly serializer: ISerializer<T>

  constructor(
    public readonly name: string,
    public readonly redis: Redis | Cluster = new Redis(),
    options: IRepositoryOptions<T> = {}
  ) {
    this.keyPrefix = `items:${name}:`
    this.matchPattern = `${escapeGlob(this.keyPrefix)}*`
    this.serializer = options.serializer ?? createMsgpackSerializer<T>()
  }

  async set(item: IItem<T>, expirationInSeconds?: number): Promise<void> {
    assertId(item.id)
    const key = this.getKey(item.id)
    const buffer = toBuffer(this.serializer.encode(item))
    if (expirationInSeconds != null) {
      assertPositiveInteger(expirationInSeconds, 'expirationInSeconds')
      await this.redis.set(key, buffer, 'EX', expirationInSeconds)
    } else {
      await this.redis.set(key, buffer)
    }
  }

  async setMany(items: IItem<T>[], expirationInSeconds?: number): Promise<void> {
    if (items.length === 0) return
    items.forEach((item) => assertId(item.id))
    if (expirationInSeconds != null) {
      assertPositiveInteger(expirationInSeconds, 'expirationInSeconds')
    }

    const entries = items.map((item) => [this.getKey(item.id), toBuffer(this.serializer.encode(item))] as const)
    if (isCluster(this.redis)) {
      // keys of a repository are spread across slots, so they are written individually
      await Promise.all(
        entries.map(([key, buffer]) =>
          expirationInSeconds != null
            ? this.redis.set(key, buffer, 'EX', expirationInSeconds)
            : this.redis.set(key, buffer)
        )
      )
      return
    }

    const tx = this.redis.multi()
    for (const [key, buffer] of entries) {
      if (expirationInSeconds != null) {
        tx.set(key, buffer, 'EX', expirationInSeconds)
      } else {
        tx.set(key, buffer)
      }
    }
    const results = await tx.exec()
    const failure = results?.find(([err]) => err)
    if (failure) throw failure[0]
  }

  async getById(id: string): Promise<IItem<T> | null> {
    if (!id) return null
    const key = this.getKey(id)
    const result = await this.redis.getBuffer(key)

    return this.decode(result)
  }

  async getByIds(ids: string[]): Promise<(IItem<T> | null)[]> {
    const valid = ids.filter((id) => id)
    const items = await this.fetch(valid.map((id) => this.getKey(id)))
    const byId = new Map(valid.map((id, i) => [id, items[i]]))

    return ids.map((id) => byId.get(id) ?? null)
  }

  async getAll(): Promise<IItem<T>[]> {
    const keys = await this.scanKeys()
    const items = await this.fetch(keys)

    return items.filter(notNull)
  }

  async getPaginated(page: number, pageSize: number): Promise<IPaginatedItems<T>> {
    const [start, end] = pageBounds(page, pageSize)
    // sorting keeps pages stable across calls, SCAN order is arbitrary
    const keys = (await this.scanKeys()).sort()
    const count = keys.length
    const items = await this.fetch(keys.slice(start, end + 1))

    return {
      items: items.filter(notNull),
      count
    }
  }

  async *iterate(options: IIterateOptions = {}): AsyncIterableIterator<IItem<T>> {
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
    assertPositiveInteger(batchSize, 'batchSize')

    // SCAN may return a key more than once
    const seen = new Set<string>()
    for await (const batch of this.scanKeyBatches(batchSize)) {
      const keys = batch.filter((key) => !seen.has(key))
      keys.forEach((key) => seen.add(key))
      for (const item of await this.fetch(keys)) {
        if (item !== null) yield item
      }
    }
  }

  async hasItem(id: string): Promise<boolean> {
    if (!id) return false
    const key = this.getKey(id)
    return (await this.redis.exists(key)) === 1
  }

  async deleteById(id: string): Promise<void> {
    // an empty id would address the index key of a SortedItemRepository with the same name
    if (!id) return
    const key = this.getKey(id)
    await this.redis.del(key)
  }

  async deleteByIds(ids: string[]): Promise<number> {
    return this.deleteKeys([...new Set(ids.filter((id) => id))].map((id) => this.getKey(id)))
  }

  async deleteAll(): Promise<void> {
    for await (const keys of this.scanKeyBatches(DELETE_CHUNK_SIZE)) {
      await this.deleteKeys(keys)
    }
  }

  async count(): Promise<number> {
    const keys = await this.scanKeys()

    return keys.length
  }

  async getTtl(id: string): Promise<number | null> {
    if (!id) return null
    const ttl = await this.redis.ttl(this.getKey(id))

    return ttl === -2 ? null : ttl
  }

  async expire(id: string, expirationInSeconds: number): Promise<boolean> {
    assertId(id)
    assertPositiveInteger(expirationInSeconds, 'expirationInSeconds')

    return (await this.redis.expire(this.getKey(id), expirationInSeconds)) === 1
  }

  async persist(id: string): Promise<boolean> {
    assertId(id)
    return (await this.redis.persist(this.getKey(id))) === 1
  }

  private getKey(id: string): string {
    return `${this.keyPrefix}${id}`
  }

  private decode(buffer: Buffer | null): IItem<T> | null {
    return buffer ? this.serializer.decode(buffer) : null
  }

  private async fetch(keys: string[]): Promise<(IItem<T> | null)[]> {
    if (keys.length === 0) return []

    // MGET across slots fails with CROSSSLOT on Redis Cluster
    const buffers = isCluster(this.redis)
      ? await Promise.all(keys.map((key) => this.redis.getBuffer(key)))
      : await this.redis.mgetBuffer(keys)

    return buffers.map((b) => this.decode(b))
  }

  private async deleteKeys(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0

    if (isCluster(this.redis)) {
      const results = await Promise.all(keys.map((key) => this.redis.del(key)))
      return results.reduce((sum, n) => sum + n, 0)
    }

    let deleted = 0
    for (const batch of chunk(keys, DELETE_CHUNK_SIZE)) {
      deleted += await this.redis.del(batch)
    }

    return deleted
  }

  private async scanKeys(): Promise<string[]> {
    const keys = new Set<string>()
    for await (const batch of this.scanKeyBatches(DEFAULT_BATCH_SIZE * 10)) {
      batch.forEach((key) => keys.add(key))
    }

    return [...keys]
  }

  private async *scanKeyBatches(count: number): AsyncGenerator<string[]> {
    // on Redis Cluster, every master holds a subset of the keys
    const nodes = isCluster(this.redis) ? (this.redis as Cluster).nodes('master') : [this.redis as Redis]
    for (const node of nodes) {
      let cursor = '0'
      do {
        const [next, keys] = await node.scan(cursor, 'MATCH', this.matchPattern, 'COUNT', count)
        cursor = next
        // the bare prefix is the index key of a SortedItemRepository with the same name
        const own = keys.filter((key) => key !== this.keyPrefix)
        if (own.length > 0) yield own
      } while (cursor !== '0')
    }
  }
}

export default ItemRepository
