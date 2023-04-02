import { IItem, ItemRepository, SortedItemRepository } from '../libs'
import { describe, expect, test, beforeAll, beforeEach, afterAll, afterEach } from 'bun:test'
import Redis from 'ioredis'

describe('SortedItemRepository', () => {
  let repository: SortedItemRepository<string>
  const redis: Redis = new Redis({
    host: '127.0.0.1',
    port: 6379
  })

  beforeAll(async () => {
    await redis.flushall()
  })

  beforeEach(() => {
    const name = `repo-${Date.now()}`
    repository = new SortedItemRepository<string>(name, redis)
  })

  afterEach(async () => {
    await redis.flushall()
  })

  afterAll(() => {
    redis.disconnect()
  })

  test('should add and get an item', async () => {
    const item: IItem<string> = { id: 'test', data: 'test' }
    await repository.set(item)

    const result = await repository.getById('test')
    expect(result).toEqual(item)
  })

  test('should get all items', async () => {
    const items: IItem<string>[] = [
      { id: 'test1', data: 'test1' },
      { id: 'test2', data: 'test2' },
      { id: 'test3', data: 'test3' }
    ]

    for (const item of items) {
      await repository.set(item)
    }

    const result = await repository.getAll()
    for (const item of result) {
      expect(items.find((i) => i.id === item.id)).toEqual(item)
    }
  })

  test('should get items score by id', async () => {
    const items: IItem<string>[] = [
      { id: 'test1', data: 'test1' },
      { id: 'test2', data: 'test2' },
      { id: 'test3', data: 'test3' }
    ]

    const scores: number[] = []
    for (const item of items) {
      await repository.set(item)
      scores.push((await repository.getItemScoreById(item.id)) as number)
    }

    expect(scores[0] < scores[1] && scores[1] < scores[2]).toBeTruthy()
  })

  test('should get items by score', async () => {
    const items: IItem<string>[] = [
      { id: 'test1', data: 'test1' },
      { id: 'test2', data: 'test2' },
      { id: 'test3', data: 'test3' }
    ]

    const scores: number[] = []
    for (const item of items) {
      await repository.set(item)
      scores.push((await repository.getItemScoreById(item.id)) as number)
    }

    const minScore = scores[0]
    const maxScore = scores[2] + 50_000

    const result = await repository.getItemsByScore(minScore, maxScore)
    expect(result.length).toBe(3)
    for (const item of result) {
      expect(items.find((i) => i.id === item.id)).toEqual(item)
    }

    const partialResult = await repository.getItemsByScore(scores[1], maxScore)
    expect(partialResult.length).toBe(2)
    for (const item of partialResult) {
      expect(items.slice(1).find((i) => i.id === item.id)).toEqual(item)
    }
  })

  test('should get paginated items', async () => {
    const items: IItem<string>[] = [
      { id: 'test1', data: 'test1' },
      { id: 'test2', data: 'test2' },
      { id: 'test3', data: 'test3' },
      { id: 'test4', data: 'test4' },
      { id: 'test5', data: 'test5' },
      { id: 'test6', data: 'test6' },
      { id: 'test7', data: 'test7' }
    ]

    for (const item of items) {
      await repository.set(item)
    }

    const result1 = await repository.getPaginated(1, 3)
    expect(result1.items.length).toBe(3)
    expect(result1.count).toBe(7)

    const result2 = await repository.getPaginated(2, 3)
    expect(result2.items.length).toBe(3)
    expect(result2.count).toBe(7)

    const result3 = await repository.getPaginated(3, 3)
    expect(result3.items.length).toBe(1)
    expect(result3.count).toBe(7)
  })

  test('should check if item exists', async () => {
    const item: IItem<string> = { id: 'test', data: 'test' }
    await repository.set(item)

    const result1 = await repository.hasItem('test')
    expect(result1).toBe(true)

    const result2 = await repository.hasItem('not-found')
    expect(result2).toBe(false)
  })

  test('should delete an item', async () => {
    const item: IItem<string> = { id: 'test', data: 'test' }
    await repository.set(item)

    await repository.deleteById('test')

    const result = await repository.getAll()
    expect(result).toEqual([])
  })

  test('should delete all items', async () => {
    const item: IItem<string> = { id: 'test', data: 'test' }
    await repository.set(item)

    await repository.deleteAll()

    const result = await repository.getAll()
    expect(result).toEqual([])
  })

  test('should delete all multiple times', async () => {
    await repository.deleteAll()
    await repository.deleteAll()
    await repository.deleteAll()
    await repository.deleteAll()

    const result = await repository.getAll()
    expect(result).toEqual([])
  })

  test('should get first N items', async () => {
    const items: IItem<string>[] = [
      { id: 'test1', data: 'test1' },
      { id: 'test2', data: 'test2' },
      { id: 'test3', data: 'test3' }
    ]

    for (const item of items) {
      await repository.set(item)
    }

    const result = await repository.getFirstNItems(2)
    expect(result).toEqual(items.slice(0, 2))
  })

  test('should get last N items', async () => {
    const items: IItem<string>[] = [
      { id: 'test1', data: 'test1' },
      { id: 'test2', data: 'test2' },
      { id: 'test3', data: 'test3' }
    ]

    for (const item of items) {
      await repository.set(item)
    }

    const result = await repository.getLastNItems(2)
    expect(result).toEqual(items.slice(1))
  })

  test('should get items in range', async () => {
    const items: IItem<string>[] = [
      { id: 'test1', data: 'test1' },
      { id: 'test2', data: 'test2' },
      { id: 'test3', data: 'test3' }
    ]

    for (const item of items) {
      await repository.set(item)
    }

    const result = await repository.getItemsInRange(1, 2)
    expect(result).toEqual(items.slice(1, 3))
  })

  test('should check if items exist in range', async () => {
    const items: IItem<string>[] = [
      { id: 'test1', data: 'test1' },
      { id: 'test2', data: 'test2' },
      { id: 'test3', data: 'test3' }
    ]

    for (const item of items) {
      await repository.set(item)
    }

    const minScore = await repository.getItemScoreById(items[0].id)
    const maxScore = await repository.getItemScoreById(items[2].id)

    expect(await repository.existsInRange(minScore as number, maxScore as number)).toBeTruthy()
    expect(await repository.existsInRange((maxScore as number) + 1, (maxScore as number) + 100)).toBeFalsy()
  })

  test('should get next N items greater than score', async () => {
    const items: IItem<string>[] = [
      { id: 'test1', data: 'test1' },
      { id: 'test2', data: 'test2' },
      { id: 'test3', data: 'test3' }
    ]

    for (const item of items) {
      await repository.set(item)
    }

    const score = await repository.getItemScoreById(items[0].id)
    const result = await repository.getNextNItemsGreaterThanScore(score as number, 2)
    expect(result).toEqual(items.slice(1))
  })
})
