import Redis, { Cluster } from 'ioredis'
import { IItem, IPaginatedItems, ISortedItemRepository, SortedItem } from './model'

export class SortedItemRepository implements ISortedItemRepository {
  private readonly keyPrefix: string
  private readonly hashPrefix: string

  constructor(public readonly name: string, public readonly redis: Redis | Cluster = new Redis()) {
    this.keyPrefix = `items:${name}:`
    this.hashPrefix = `items-data:${name}:`
  }

  async add(item: SortedItem): Promise<void> {
    const score = item.score
    const hashData = JSON.stringify(item)

    await Promise.all([
      await this.redis.hset(this.hashPrefix, item.id, hashData),
      await this.redis.zadd(this.keyPrefix, score, item.id)
    ])
  }

  async updateById(id: string, data: unknown): Promise<boolean> {
    const item = await this.getById(id)
    if (item == null) return false

    item.data = data
    const hashData = JSON.stringify(item)
    await this.redis.hset(this.hashPrefix, id, hashData)

    return true
  }

  async getById(id: string): Promise<IItem | null> {
    const hashData = await this.redis.hget(this.hashPrefix, id)

    return hashData != null ? (JSON.parse(hashData) as IItem) : null
  }

  async getAll(): Promise<IItem[]> {
    const keys = await this.redis.zrange(this.keyPrefix, 0, -1)
    if (keys.length === 0) {
      return []
    }

    const hashDataList = await this.redis.hmget(this.hashPrefix, ...keys)

    return hashDataList.map((hashData) => JSON.parse(hashData as string)) as IItem[]
  }

  async getPaginated(page: number, pageSize: number): Promise<IPaginatedItems> {
    const count = await this.redis.zcard(this.keyPrefix)
    const start = (page - 1) * pageSize
    const end = start + pageSize - 1
    const keys = await this.redis.zrange(this.keyPrefix, start, end)
    if (keys.length === 0) {
      return {
        items: [],
        count: 0
      }
    }

    const hashDataList = await this.redis.hmget(this.hashPrefix, ...keys)
    const parsedItems = hashDataList.map((hashData) => JSON.parse(hashData as string)) as IItem[]

    return {
      items: parsedItems,
      count
    }
  }

  async deletePage(page: number, pageSize: number): Promise<void> {
    const start = (page - 1) * pageSize
    const end = start + pageSize - 1
    const keys = await this.redis.zrange(this.keyPrefix, start, end)
    if (keys.length > 0) {
      await Promise.all([this.redis.zrem(this.keyPrefix, ...keys), this.redis.hdel(this.hashPrefix, ...keys)])
    }
  }

  async hasItem(id: string): Promise<boolean> {
    return (await this.redis.hexists(this.hashPrefix, id)) === 1
  }

  async deleteById(id: string): Promise<void> {
    await Promise.all([this.redis.zrem(this.keyPrefix, id), this.redis.hdel(this.hashPrefix, id)])
  }

  async count(): Promise<number> {
    const count = await this.redis.zcard(this.keyPrefix)

    return count
  }

  async deleteAll(): Promise<void> {
    await Promise.all([await this.redis.del(this.hashPrefix), await this.redis.del(this.keyPrefix)])
  }
}

export default SortedItemRepository
