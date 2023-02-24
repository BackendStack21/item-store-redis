import { SortedItem, SortedItemRepository } from "../libs"
import { describe, expect, test, beforeAll, beforeEach, afterAll, afterEach } from "bun:test"
import Redis from "ioredis"

describe("SortedItemRepository", () => {
  const redis: Redis = new Redis({
    host: "127.0.0.1",
    port: 6379
  })

  let repository: SortedItemRepository

  afterEach(async () => {
    await redis.flushall()
  })

  afterAll(() => {
    redis.disconnect()
  })

  beforeAll(async () => {
    await redis.flushall()
  })

  beforeEach(async () => {
    const name = `repo-${Date.now()}`
    repository = new SortedItemRepository(name, redis)
  })

  test("should add a new item to the repository", async () => {
    const item = new SortedItem({ foo: "bar" })
    await repository.add(item)

    const result = await repository.getById(item.id)
    expect(result).toEqual(item)
  })

  test("should update an item in the repository", async () => {
    const item = new SortedItem({ foo: "bar" })
    await repository.add(item)

    let result = await repository.getById(item.id)
    expect(result).toEqual(item)

    await repository.updateById(item.id, "update")
    result = await repository.getById(item.id)
    expect(result?.data).toEqual("update")
    expect(result?.id).toEqual(item.id)
    expect((result as SortedItem).score).toEqual(item.score)
  })

  test("should return null for a non-existent id", async () => {
    const result = await repository.getById("invalid-id")
    expect(result).toBeNull()
  })

  test("should return the item for an existing id", async () => {
    const item = new SortedItem({ foo: "bar" })
    await repository.add(item)

    expect(1).toEqual(await repository.count())

    const result = await repository.getById(item.id)
    expect(result).toEqual(item)
  })

  test("should return an empty array for an empty repository", async () => {
    const result = await repository.getAll()
    expect(result).toEqual([])
  })

  test("should return all items in the repository", async () => {
    const items = [new SortedItem({ foo: "bar" }), new SortedItem({ baz: "qux" }), new SortedItem({ quux: "corge" })]

    for (const item of items) {
      await repository.add(item)
    }

    expect(items.length).toEqual(await repository.count())

    const result = await repository.getAll()
    expect(result).toEqual(items)
  })

  test("should return an empty array for an empty repository", async () => {
    const result = await repository.getPaginated(1, 10)
    expect(result).toEqual({ items: [], count: 0 })
  })

  test("should return the correct page of items from the repository", async () => {
    const items = [
      new SortedItem({ foo: "bar" }),
      new SortedItem({ baz: "qux" }),
      new SortedItem({ quux: "corge" }),
      new SortedItem({ grault: "garply" }),
      new SortedItem({ waldo: "fred" }),
      new SortedItem({ plugh: "xyzzy" }),
    ]

    for (const item of items) {
      await repository.add(item)
    }

    const result = await repository.getPaginated(2, 2)
    expect(result.count).toEqual(items.length)
    expect(result.items).toEqual([items[2], items[3]])
  })

  test("should get paginated items", async () => {
    const items = [
      new SortedItem({ foo: "bar" }),
      new SortedItem({ baz: "qux" }),
      new SortedItem({ quux: "corge" }),
      new SortedItem({ grault: "garply" }),
      new SortedItem({ waldo: "fred" }),
      new SortedItem({ plugh: "xyzzy" }),
      new SortedItem({ plugh: "json" }),
    ]

    for (const item of items) {
      await repository.add(item)
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

  test("should check if item exists", async () => {
    const item = new SortedItem({ foo: "bar" })
    await repository.add(item)

    const result1 = await repository.hasItem(item.id)
    expect(result1).toBe(true)

    const result2 = await repository.hasItem("not-found")
    expect(result2).toBe(false)
  })

  test("should delete an item", async () => {
    const item = new SortedItem({ foo: "bar" })
    await repository.add(item)

    await repository.deleteById(item.id)

    const result = await repository.getAll()
    expect(result).toEqual([])
  })

  test("should delete page", async () => {
    const items = [
      new SortedItem({ foo: "bar" }),
      new SortedItem({ baz: "qux" }),
      new SortedItem({ quux: "corge" }),
      new SortedItem({ grault: "garply" }),
      new SortedItem({ waldo: "fred" }),
      new SortedItem({ plugh: "xyzzy" }),
      new SortedItem({ plugh: "xml" }),
      new SortedItem({ plugh: "json" }),
    ]

    for (const item of items) {
      await repository.add(item)
    }

    await repository.deletePage(1, 2)
    expect(await repository.hasItem(items[0].id)).toBe(false)
    expect(await repository.hasItem(items[1].id)).toBe(false)

    await repository.deletePage(3, 2)
    expect(await repository.hasItem(items[6].id)).toBe(false)
    expect(await repository.hasItem(items[7].id)).toBe(false)
  })

  test("should delete all items", async () => {
    const item = new SortedItem({ foo: "bar" })
    await repository.add(item)

    await repository.deleteAll()

    const result = await repository.getAll()
    expect(result).toEqual([])
  })

  test("should delete all multiple times", async () => {
    await repository.deleteAll()
    await repository.deleteAll()
    await repository.deleteAll()
    await repository.deleteAll()

    const result = await repository.getAll()
    expect(result).toEqual([])
  })
})
