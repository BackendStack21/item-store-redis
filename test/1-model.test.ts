import { IItem, IPaginatedItems } from '../libs'
import { describe, expect, test } from 'bun:test'

describe('IPaginatedItems', () => {
  test('items is an array of IItem', () => {
    const items: IItem<string>[] = [{ id: 'test', data: 'test' }]
    const paginatedItems: IPaginatedItems<string> = { items, count: 1 }
    expect(Array.isArray(paginatedItems.items)).toBe(true)
    expect(paginatedItems.items.length).toBe(items.length)
    expect(paginatedItems.items[0]).toEqual(items[0])
  })

  test('count is a number', () => {
    const paginatedItems: IPaginatedItems<unknown> = { items: [], count: 1 }
    expect(typeof paginatedItems.count).toBe('number')
  })
})
