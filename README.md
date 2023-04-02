# Introduction
[![NPM version](https://badgen.net/npm/v/item-store-redis)](https://www.npmjs.com/package/item-store-redis)
[![NPM Total Downloads](https://badgen.net/npm/dt/item-store-redis)](https://www.npmjs.com/package/item-store-redis)
[![License](https://badgen.net/npm/license/item-store-redis)](https://www.npmjs.com/package/item-store-redis)
[![TypeScript support](https://badgen.net/npm/types/item-store-redis)](https://www.npmjs.com/package/item-store-redis)
[![Github stars](https://badgen.net/github/stars/BackendStack21/item-store-redis?icon=github)](https://github.com/BackendStack21/item-store-redis.git)

<img src="illustration.svg" width="400">  

> Explanatory article: https://medium.com/@kyberneees/introducing-item-store-redis-a-high-performance-redis-based-item-store-for-efficient-data-4510d4e9fcf9

This module provides classes that implement repositories for storing and retrieving data in a Redis database:

- `ItemRepository`: The class provides basic functionality for storing and retrieving individual items, as well as querying all items or a subset of items in a paginated manner. The items are stored in Redis using a key-value data model with expiration support. 
- `SortedItemRepository`: The class provides a more advanced functionality for storing and retrieving items in a sorted manner. The items are sorted based on a numeric score, and can be queried in a paginated manner as well. The items are stored in Redis using a sorted set data model, making it more performant and efficient at scale (see `demos/benchmark.ts`). However, this model does not supports automatic expiration.

```ts
import { ItemRepository, SortedItemRepository, IItem } from 'item-store-redis'
```

## Class ItemRepository

### Constructor
```ts
constructor (name: string, redis?: Redis | Cluster)
```

### Usage
```ts
import { ItemRepository } from 'item-store-redis'
import Redis from 'ioredis'

const redis = new Redis({ host: 'localhost', port: 6379 })
const repository = new ItemRepository<T>('my-unsorted-repo', redis)
...
```

### Interface
```ts
interface IItemRepository<T> {
  name: string
  redis: Redis | Cluster
  set: (item: IItem<T>, expirationInSeconds?: number) => Promise<void>
  getById: (id: string) => Promise<IItem<T> | null>
  getAll: () => Promise<IItem<T>[]>
  getPaginated: (page: number, pageSize: number) => Promise<IPaginatedItems<T>>
  hasItem: (id: string) => Promise<boolean>
  deleteById: (id: string) => Promise<void>
  deleteAll: () => Promise<void>
  count: () => Promise<number>
}
```

## Class SortedItemRepository

### Constructor
```ts
constructor (name: string, redis?: Redis | Cluster)
```

### Usage
```ts
import { SortedItemRepository, SortedItem } from 'item-store-redis'
import Redis from 'ioredis'

const redis = new Redis({ host: 'localhost', port: 6379 })
const repository = new SortedItemRepository<T>('my-sorted-repo', redis)
...
```

### Interface
```ts
/**
 * ISortedItemRepository is an interface that defines the methods for interacting with a
 * sorted item repository that uses Redis as the storage system.
 */
export interface ISortedItemRepository<T> {
  name: string
  redis: Redis | Cluster

  /**
   * Sets an item in the repository.
   * @param item - The item to be added.
   */
  set: (item: IItem<T>) => Promise<void>

  /**
   * Retrieves an item from the repository by its ID.
   * @param id - The ID of the item to retrieve.
   * @returns The item if found, null otherwise.
   */
  getById: (id: string) => Promise<IItem<T> | null>

  /**
   * Retrieves all items from the repository.
   * @returns An array of all items in the repository.
   */
  getAll: () => Promise<IItem<T>[]>

  /**
   * Retrieves a paginated set of items from the repository.
   * @param page - The page number to retrieve.
   * @param pageSize - The number of items per page.
   * @returns An object containing the paginated items and the total count of items.
   */
  getPaginated: (page: number, pageSize: number) => Promise<IPaginatedItems<T>>

  /**
   * Retrieves the score of an item by its ID.
   * @param id - The ID of the item.
   * @returns The score of the item if found, null otherwise.
   */
  getItemScoreById: (id: string) => Promise<number | null>

  /**
   * Retrieves items by their scores within a specified range.
   * @param min - The minimum score value.
   * @param max - The maximum score value.
   * @returns An array of items with scores within the specified range.
   */
  getItemsByScore: (min: number, max: number) => Promise<IItem<T>[]>

  /**
   * Deletes a page of items from the repository.
   * @param page - The page number of items to delete.
   * @param pageSize - The number of items per page.
   */
  deletePage: (page: number, pageSize: number) => Promise<void>

  /**
   * Checks if an item exists in the repository by its ID.
   * @param id - The ID of the item.
   * @returns A boolean indicating whether the item exists.
   */
  hasItem: (id: string) => Promise<boolean>

  /**
   * Deletes an item from the repository by its ID.
   * @param id - The ID of the item to delete.
   */
  deleteById: (id: string) => Promise<void>

  /**
   * Deletes all items from the repository.
   */
  deleteAll: () => Promise<void>

  /**
   * Retrieves the count of items in the repository.
   * @returns The count of items.
   */
  count: () => Promise<number>

  /**
   * Retrieves the first N items from the repository.
   * @param n - The number of items to retrieve.
   * @returns An array of the first N items.
   */
  getFirstNItems: (n: number) => Promise<IItem<T>[]>

  /**
   * Retrieves the last N items from the repository.
   * @param n - The number of items to retrieve.
   * @returns An array of the last N items.
   */
  getLastNItems: (n: number) => Promise<IItem<T>[]>

  /**
   * Retrieves items within a specified index range.
   * @param start - The starting index.
   * @param end - The ending index.
   *
   * @returns An array of items within the specified index range.
   */
  getItemsInRange: (start: number, end: number) => Promise<IItem<T>[]>

  /**
   *
   * Checks if any items exist within a specified score range.
   * @param min - The minimum score value.
   * @param max - The maximum score value.
   * @returns A boolean indicating whether any items exist within the specified score range.
   */
  existsInRange: (min: number, max: number) => Promise<boolean>

  /**
   *
   * Retrieves the next N items with scores greater than a specified score.
   * @param score - The score to compare.
   * @param n - The number of items to retrieve.
   * @returns An array of the next N items with scores greater than the specified score.
   */
  getNextNItemsGreaterThanScore: (score: number, n: number) => Promise<IItem<T>[]>
}

```

# License

```
MIT License

Copyright (c) 2023 21no.de

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```