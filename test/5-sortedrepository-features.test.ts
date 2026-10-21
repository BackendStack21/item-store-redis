import { IItem, ISerializer, SortedItemRepository } from '../libs'
import { describe, expect, test, beforeAll, beforeEach, afterAll, afterEach } from 'bun:test'
import Redis from 'ioredis'

const toItems = (n: number): IItem<string>[] =>
  Array.from({ length: n }, (_, i) => ({ id: `item-${String(i).padStart(3, '0')}`, data: `data-${i}` }))

const ids = (items: IItem<string>[]): string[] => items.map((i) => i.id)

const expectRejection = async (promise: Promise<unknown>, type: new (...args: never[]) => Error): Promise<void> => {
  let error: unknown
  try {
    await promise
  } catch (err) {
    error = err
  }
  expect(error instanceof type).toBe(true)
}

describe('SortedItemRepository bug fixes and features', () => {
  let repository: SortedItemRepository<string>
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
    repository = new SortedItemRepository<string>(name, redis)
  })

  afterEach(async () => {
    await redis.flushall()
  })

  afterAll(() => {
    redis.disconnect()
  })

  test('default scores are wall-clock based and safe integers', async () => {
    const before = Date.now() * 1000
    await repository.set({ id: 'a', data: 'a' })
    const score = (await repository.getItemScoreById('a')) as number

    expect(score).toBeGreaterThanOrEqual(before)
    expect(score).toBeLessThanOrEqual(Date.now() * 1000 + 1000)
    expect(Number.isSafeInteger(score)).toBe(true)
  })

  test('scores are ordered across repository instances', async () => {
    const other = new SortedItemRepository<string>(name, redis)
    await repository.set({ id: 'z', data: 'z' })
    await other.set({ id: 'a', data: 'a' })

    expect(ids(await repository.getAll())).toEqual(['z', 'a'])
  })

  test('getPaginated returns the total count on an out of range page', async () => {
    await repository.setMany(toItems(5))

    const result = await repository.getPaginated(2, 5)
    expect(result.items).toEqual([])
    expect(result.count).toBe(5)
  })

  test('rejects invalid pagination and n arguments instead of returning everything', async () => {
    await repository.setMany(toItems(5))

    await expectRejection(repository.getPaginated(0, 2), RangeError)
    await expectRejection(repository.getPaginated(1, 0), RangeError)
    await expectRejection(repository.deletePage(1, 0), RangeError)
    await expectRejection(repository.getFirstNItems(-1), RangeError)
    await expectRejection(repository.getNextNItemsGreaterThanScore(0, -1), RangeError)
    expect(await repository.getFirstNItems(0)).toEqual([])
    expect(await repository.getLastNItems(0)).toEqual([])
    expect(await repository.getNextNItemsGreaterThanScore(0, 0)).toEqual([])
    expect(await repository.count()).toBe(5)
  })

  test('read methods skip indexed ids without data', async () => {
    await repository.setMany(toItems(3))
    await redis.hdel(`items-data:${name}:`, 'item-001')

    expect(ids(await repository.getAll())).toEqual(['item-000', 'item-002'])
    expect(ids((await repository.getPaginated(1, 10)).items)).toEqual(['item-000', 'item-002'])
    expect(ids(await repository.getFirstNItems(3))).toEqual(['item-000', 'item-002'])
  })

  test('set keeps index and data consistent under concurrent set and delete', async () => {
    await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        i % 2 === 0 ? repository.set({ id: 'same', data: `${i}` }) : repository.deleteById('same')
      )
    )

    const indexed = await redis.zcard(`items:${name}:`)
    const stored = await redis.hlen(`items-data:${name}:`)
    expect(indexed).toBe(stored)
  })

  test('set with an explicit score', async () => {
    await repository.set({ id: 'b', data: 'b' }, { score: 20 })
    await repository.set({ id: 'a', data: 'a' }, { score: 10 })

    expect(await repository.getItemScoreById('a')).toBe(10)
    expect(ids(await repository.getAll())).toEqual(['a', 'b'])
    await expectRejection(repository.set({ id: 'c', data: 'c' }, { score: NaN }), RangeError)
  })

  test('set with keepScore preserves the position of updated items', async () => {
    await repository.setMany(toItems(3))
    await repository.set({ id: 'item-000', data: 'updated' }, { keepScore: true })

    const all = await repository.getAll()
    expect(ids(all)).toEqual(['item-000', 'item-001', 'item-002'])
    expect(all[0].data).toBe('updated')

    await repository.set({ id: 'item-000', data: 'moved' })
    expect(ids(await repository.getAll())).toEqual(['item-001', 'item-002', 'item-000'])
  })

  test('getPaginated in descending order', async () => {
    await repository.setMany(toItems(5))

    const result = await repository.getPaginated(1, 2, 'desc')
    expect(ids(result.items)).toEqual(['item-004', 'item-003'])
    expect(result.count).toBe(5)
  })

  test('getItemsByScore supports infinite bounds, limit, offset and order', async () => {
    const items = toItems(5)
    for (const [i, item] of items.entries()) {
      await repository.set(item, { score: i })
    }

    expect(ids(await repository.getItemsByScore('-inf', '+inf'))).toEqual(ids(items))
    expect(ids(await repository.getItemsByScore(1, '+inf', { offset: 1, limit: 2 }))).toEqual(['item-002', 'item-003'])
    expect(ids(await repository.getItemsByScore(0, 4, { order: 'desc', limit: 2 }))).toEqual(['item-004', 'item-003'])
    expect(await repository.getItemsByScore(0, 4, { limit: 0 })).toEqual([])
  })

  test('setMany, getByIds and deleteByIds', async () => {
    const items = toItems(4)
    await repository.setMany(items)

    expect(ids(await repository.getAll())).toEqual(ids(items))
    expect(await repository.getByIds(['item-003', 'missing'])).toEqual([items[3], null])
    expect(await repository.deleteByIds(['item-000', 'item-002', 'missing'])).toBe(2)
    expect(ids(await repository.getAll())).toEqual(['item-001', 'item-003'])
    expect(await redis.hlen(`items-data:${name}:`)).toBe(2)
  })

  test('iterate streams all items in order', async () => {
    const items = toItems(25)
    await repository.setMany(items)

    const asc: string[] = []
    for await (const item of repository.iterate({ batchSize: 10 })) {
      asc.push(item.id)
    }
    expect(asc).toEqual(ids(items))

    const desc: string[] = []
    for await (const item of repository.iterate({ batchSize: 5, order: 'desc' })) {
      desc.push(item.id)
    }
    expect(desc).toEqual(ids(items).reverse())
  })

  test('deleteByScore and trimToSize', async () => {
    const items = toItems(10)
    for (const [i, item] of items.entries()) {
      await repository.set(item, { score: i })
    }

    expect(await repository.deleteByScore(0, 2)).toBe(3)
    expect(await repository.trimToSize(4)).toBe(3)
    expect(ids(await repository.getAll())).toEqual(['item-006', 'item-007', 'item-008', 'item-009'])
    expect(await repository.trimToSize(10)).toBe(0)
    expect(await redis.hlen(`items-data:${name}:`)).toBe(4)
  })

  test('maxItems caps the repository size', async () => {
    const capped = new SortedItemRepository<string>(name, redis, { maxItems: 3 })
    await capped.setMany(toItems(5))
    await capped.set({ id: 'last', data: 'last' })

    expect(ids(await capped.getAll())).toEqual(['item-003', 'item-004', 'last'])
    expect(await capped.hasItem('item-000')).toBe(false)
  })

  test('hashTag option wraps the name in a cluster hash tag', async () => {
    const tagged = new SortedItemRepository<string>(name, redis, { hashTag: true })
    await tagged.set({ id: 'a', data: 'a' })

    expect(await redis.exists(`items:{${name}}:`, `items-data:{${name}}:`)).toBe(2)
    expect(await tagged.getById('a')).toEqual({ id: 'a', data: 'a' })
  })

  test('supports a custom serializer', async () => {
    const serializer: ISerializer<string> = {
      encode: (item) => Buffer.from(JSON.stringify(item)),
      decode: (buffer) => JSON.parse(buffer.toString())
    }
    const jsonRepository = new SortedItemRepository<string>(name, redis, { serializer })
    await jsonRepository.set({ id: 'a', data: 'a' })

    expect(await redis.hget(`items-data:${name}:`, 'a')).toBe(JSON.stringify({ id: 'a', data: 'a' }))
    expect(await jsonRepository.getAll()).toEqual([{ id: 'a', data: 'a' }])
  })
})
