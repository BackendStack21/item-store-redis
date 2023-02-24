import Redis, { Cluster } from 'ioredis'
import { IItem, IItemRepository, IPaginatedItems } from './model'

export class ItemRepository implements IItemRepository {
  private readonly keyPrefix: string

  constructor (public readonly name: string, public readonly redis: Redis | Cluster = new Redis()) {
    this.keyPrefix = `items:${name}:`
  }

  async set (item: IItem, expirationInSeconds?: number): Promise<void> {
    const key = this.getKey(item.id)
    const value = JSON.stringify(item)
    if (expirationInSeconds != null) {
      await this.redis.setex(key, expirationInSeconds, value)
    } else {
      await this.redis.set(key, value)
    }
  }

  async getById (id: string): Promise<IItem | null> {
    const key = this.getKey(id)
    const result = await this.redis.get(key)
    return result != null ? (JSON.parse(result) as IItem) : null
  }

  async getAll (): Promise<IItem[]> {
    const keys = await this.redis.keys(this.getKey('*'))
    if (keys.length === 0) {
      return []
    }

    const items = await this.redis.mget(keys)
    return items.map((item) => JSON.parse(item as string)) as IItem[]
  }

  async getPaginated (page: number, pageSize: number): Promise<IPaginatedItems> {
    const keys = await this.redis.keys(this.getKey('*'))
    const count = keys.length
    const start = (page - 1) * pageSize
    const end = start + pageSize - 1
    const itemKeys = keys.slice(start, end + 1)
    if (itemKeys.length === 0) {
      return {
        items: [],
        count: 0
      }
    }

    const items = await this.redis.mget(itemKeys)
    const parsedItems = items.map((item) => JSON.parse(item as string)) as IItem[]

    return {
      items: parsedItems,
      count
    }
  }

  async hasItem (id: string): Promise<boolean> {
    const key = this.getKey(id)
    return await this.redis.exists(key) === 1
  }

  async deleteById (id: string): Promise<void> {
    const key = this.getKey(id)
    await this.redis.del(key)
  }

  async deleteAll (): Promise<void> {
    const keys = await this.redis.keys(this.getKey('*'))
    if (keys.length > 0) {
      await this.redis.del(keys)
    }
  }

  private getKey (id: string): string {
    return `${this.keyPrefix}${id}`
  }
}

export default ItemRepository
