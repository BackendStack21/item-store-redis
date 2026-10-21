import { IItem, ItemRepository, SortedItemRepository, ISerializer } from '../libs'
import { describe, expect, test, beforeAll, beforeEach, afterAll, afterEach } from 'bun:test'
import Redis from 'ioredis'

const toItems = (n: number): IItem<string>[] =>
  Array.from({ length: n }, (_, i) => ({ id: `item-${String(i).padStart(3, '0')}`, data: `data-${i}` }))

const expectRejection = async (promise: Promise<unknown>, type: new (...args: never[]) => Error): Promise<void> => {
  let error: unknown
  try {
    await promise
  } catch (err) {
    error = err
  }
  expect(error instanceof type).toBe(true)
}

describe('ItemRepository bug fixes and features', () => {
  let repository: ItemRepository<string>
  let name: string
  const redis: Redis = new Redis({
    host: '127.0.0.1',
    port: 6379
  })

  beforeAll(async () => {
    await redis.flushall()
  })

  beforeEach(() => {
    name = `repo-${crypto.randomUUID()}`
    repository = new ItemRepository(name, redis)
  })

  afterEach(async () => {
    await redis.flushall()
  })

  afterAll(() => {
    redis.disconnect()
  })

  test('getPaginated returns the total count on an out of range page', async () => {
    await repository.setMany(toItems(5))

    const result = await repository.getPaginated(3, 5)
    expect(result.items).toEqual([])
    expect(result.count).toBe(5)
  })

  test('getPaginated returns stable, non overlapping pages', async () => {
    const items = toItems(25)
    await repository.setMany(items)

    const seen: string[] = []
    for (let page = 1; page <= 3; page++) {
      const { items: pageItems } = await repository.getPaginated(page, 10)
      seen.push(...pageItems.map((i) => i.id))
    }
    expect(seen).toEqual(items.map((i) => i.id))
  })

  test('rejects invalid pagination arguments and expirations', async () => {
    await expectRejection(repository.getPaginated(0, 10), RangeError)
    await expectRejection(repository.getPaginated(1, 0), RangeError)
    await expectRejection(repository.getPaginated(1.5, 10), RangeError)
    await expectRejection(repository.set({ id: 'a', data: 'a' }, 0), RangeError)
    await expectRejection(repository.set({ id: '', data: 'a' }), TypeError)
  })

  test('repository names are matched literally, not as glob patterns', async () => {
    const other = new ItemRepository<string>('other', redis)
    await other.set({ id: 'x', data: 'x' })
    const wildcard = new ItemRepository<string>('*', redis)
    await wildcard.set({ id: 'y', data: 'y' })

    expect(await wildcard.count()).toBe(1)
    await wildcard.deleteAll()
    expect(await other.getById('x')).toEqual({ id: 'x', data: 'x' })
  })

  test('does not collide with a SortedItemRepository using the same name', async () => {
    const sorted = new SortedItemRepository<string>(name, redis)
    await sorted.set({ id: 's', data: 's' })
    await repository.set({ id: 'a', data: 'a' })

    expect(await repository.count()).toBe(1)
    expect(await repository.getAll()).toEqual([{ id: 'a', data: 'a' }])
    expect(await repository.hasItem('')).toBe(false)

    await repository.deleteAll()
    expect(await sorted.getAll()).toEqual([{ id: 's', data: 's' }])
  })

  test('setMany, getByIds and deleteByIds', async () => {
    const items = toItems(3)
    await repository.setMany(items)

    expect(await repository.getByIds(['item-002', 'missing', 'item-000'])).toEqual([items[2], null, items[0]])
    expect(await repository.deleteByIds(['item-000', 'item-001', 'missing'])).toBe(2)
    expect(await repository.getAll()).toEqual([items[2]])
  })

  test('setMany applies the expiration to every item', async () => {
    await repository.setMany(toItems(2), 100)

    expect(await repository.getTtl('item-000')).toBeGreaterThan(0)
    expect(await repository.getTtl('item-001')).toBeGreaterThan(0)
  })

  test('iterate streams all items in batches', async () => {
    const items = toItems(250)
    await repository.setMany(items)

    const ids: string[] = []
    for await (const item of repository.iterate({ batchSize: 20 })) {
      ids.push(item.id)
    }
    expect(ids.sort()).toEqual(items.map((i) => i.id))
  })

  test('deleteAll removes large repositories', async () => {
    await repository.setMany(toItems(1200))
    await repository.deleteAll()

    expect(await repository.count()).toBe(0)
  })

  test('getTtl, expire and persist', async () => {
    await repository.set({ id: 'a', data: 'a' })

    expect(await repository.getTtl('a')).toBe(-1)
    expect(await repository.getTtl('missing')).toBeNull()

    expect(await repository.expire('a', 100)).toBe(true)
    const ttl = (await repository.getTtl('a')) as number
    expect(ttl > 0 && ttl <= 100).toBe(true)

    expect(await repository.persist('a')).toBe(true)
    expect(await repository.getTtl('a')).toBe(-1)
    expect(await repository.expire('missing', 100)).toBe(false)
  })

  test('supports a custom serializer', async () => {
    const serializer: ISerializer<string> = {
      encode: (item) => Buffer.from(JSON.stringify(item)),
      decode: (buffer) => JSON.parse(buffer.toString())
    }
    const jsonRepository = new ItemRepository<string>(name, redis, { serializer })
    await jsonRepository.set({ id: 'a', data: 'a' })

    expect(JSON.parse((await redis.get(`items:${name}:a`)) as string)).toEqual({ id: 'a', data: 'a' })
    expect(await jsonRepository.getById('a')).toEqual({ id: 'a', data: 'a' })
  })
})
