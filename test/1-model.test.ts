import { SortedItem, IItem, IPaginatedItems } from "../libs"
import { describe, expect, test } from "bun:test"

describe("SortedItem", () => {
  test("id is a string", () => {
    const item = new SortedItem("test", "key1")
    expect(item.id).toBe("key1")
    expect(item.data).toBe("test")
  })

  test("toScore returns a number", () => {
    const item = new SortedItem("test")
    expect(typeof item.score).toBe("number")
  })
})

describe("IPaginatedItems", () => {
  test("items is an array of IItem", () => {
    const items: IItem[] = [{ id: "test", data: "test" }]
    const paginatedItems: IPaginatedItems = { items, count: 1 }
    expect(Array.isArray(paginatedItems.items)).toBe(true)
    expect(paginatedItems.items.length).toBe(items.length)
    expect(paginatedItems.items[0]).toEqual(items[0])
  })

  test("count is a number", () => {
    const paginatedItems: IPaginatedItems = { items: [], count: 1 }
    expect(typeof paginatedItems.count).toBe("number")
  })
})
