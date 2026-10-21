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
- `SortedItemRepository`: The class provides a more advanced functionality for storing and retrieving items in a sorted manner. The items are sorted based on a numeric score, and can be queried in a paginated manner as well. The items are stored in Redis using a sorted set data model, making it more performant and efficient at scale (see `demos/benchmark.ts`). Per-item expiration is not supported, but size and age based retention is available through `maxItems`, `trimToSize` and `deleteByScore`.

```ts
import { ItemRepository, SortedItemRepository, IItem } from 'item-store-redis'
```

## Class ItemRepository

### Constructor
```ts
constructor (name: string, redis?: Redis | Cluster, options?: IRepositoryOptions<T>)

interface IRepositoryOptions<T> {
  serializer?: ISerializer<T> // defaults to MessagePack
}
```

### Usage
```ts
import { ItemRepository, IItem } from 'item-store-redis'
import Redis from 'ioredis'

const redis = new Redis({ host: 'localhost', port: 6379 })
const repository = new ItemRepository<T>('my-unsorted-repo', redis)

await repository.set({ id: 'a', data }, 60) // expires in 60 seconds
await repository.setMany([{ id: 'b', data }, { id: 'c', data }])
const [a, missing] = await repository.getByIds(['a', 'missing']) // missing === null

for await (const item of repository.iterate({ batchSize: 500 })) {
  // streams the whole repository without loading it in memory
}
```

### Interface
```ts
interface IItemRepository<T> {
  name: string
  redis: Redis | Cluster
  set: (item: IItem<T>, expirationInSeconds?: number) => Promise<void>
  setMany: (items: IItem<T>[], expirationInSeconds?: number) => Promise<void>
  getById: (id: string) => Promise<IItem<T> | null>
  getByIds: (ids: string[]) => Promise<(IItem<T> | null)[]>
  getAll: () => Promise<IItem<T>[]>
  getPaginated: (page: number, pageSize: number) => Promise<IPaginatedItems<T>>
  iterate: (options?: { batchSize?: number }) => AsyncIterableIterator<IItem<T>>
  hasItem: (id: string) => Promise<boolean>
  deleteById: (id: string) => Promise<void>
  deleteByIds: (ids: string[]) => Promise<number>
  deleteAll: () => Promise<void>
  count: () => Promise<number>
  getTtl: (id: string) => Promise<number | null> // -1: no expiration, null: not found
  expire: (id: string, expirationInSeconds: number) => Promise<boolean>
  persist: (id: string) => Promise<boolean>
}
```

Keys are discovered with `SCAN` (never `KEYS`), on every master node when using Redis Cluster. Pages are ordered by item key, so they are stable across calls.

## Class SortedItemRepository

### Constructor
```ts
constructor (name: string, redis?: Redis | Cluster, options?: ISortedRepositoryOptions<T>)

interface ISortedRepositoryOptions<T> {
  serializer?: ISerializer<T> // defaults to MessagePack
  maxItems?: number // caps the repository size, the lowest scored (oldest) items are removed
  hashTag?: boolean // see "Redis Cluster" below
}
```

### Usage
```ts
import { SortedItemRepository, IItem } from 'item-store-redis'
import Redis from 'ioredis'

const redis = new Redis({ host: 'localhost', port: 6379 })
const repository = new SortedItemRepository<T>('my-sorted-repo', redis)

await repository.set({ id: 'a', data }) // scored by insertion time (microseconds since epoch)
await repository.set({ id: 'b', data }, { score: 42 }) // explicit score
await repository.set({ id: 'a', data: newData }, { keepScore: true }) // update without moving the item

const latest = await repository.getPaginated(1, 10, 'desc')
const lastHour = await repository.getItemsByScore((Date.now() - 3_600_000) * 1000, '+inf', { limit: 100 })
await repository.deleteByScore('-inf', (Date.now() - 86_400_000) * 1000) // retention: drop items older than a day
```

### Interface
```ts
interface ISortedItemRepository<T> {
  name: string
  redis: Redis | Cluster
  set: (item: IItem<T>, options?: { score?: number; keepScore?: boolean }) => Promise<void>
  setMany: (items: IItem<T>[], options?: { score?: number; keepScore?: boolean }) => Promise<void>
  getById: (id: string) => Promise<IItem<T> | null>
  getByIds: (ids: string[]) => Promise<(IItem<T> | null)[]>
  getAll: () => Promise<IItem<T>[]>
  getPaginated: (page: number, pageSize: number, order?: 'asc' | 'desc') => Promise<IPaginatedItems<T>>
  iterate: (options?: { batchSize?: number; order?: 'asc' | 'desc' }) => AsyncIterableIterator<IItem<T>>
  getItemScoreById: (id: string) => Promise<number | null>
  getItemsByScore: (min: ScoreBound, max: ScoreBound, options?: IScoreRangeOptions) => Promise<IItem<T>[]>
  getFirstNItems: (n: number) => Promise<IItem<T>[]>
  getLastNItems: (n: number) => Promise<IItem<T>[]>
  getItemsInRange: (start: number, end: number) => Promise<IItem<T>[]>
  getNextNItemsGreaterThanScore: (score: number, n: number) => Promise<IItem<T>[]>
  existsInRange: (min: ScoreBound, max: ScoreBound) => Promise<boolean>
  hasItem: (id: string) => Promise<boolean>
  count: () => Promise<number>
  deleteById: (id: string) => Promise<void>
  deleteByIds: (ids: string[]) => Promise<number>
  deletePage: (page: number, pageSize: number) => Promise<void>
  deleteByScore: (min: ScoreBound, max: ScoreBound) => Promise<number>
  trimToSize: (maxItems: number) => Promise<number>
  deleteAll: () => Promise<void>
}

type ScoreBound = number | '-inf' | '+inf'

interface IScoreRangeOptions {
  offset?: number
  limit?: number
  order?: 'asc' | 'desc'
}
```

See `libs/model.ts` for the documented interfaces.

## Validation
Pages start at `1`; `page`, `pageSize`, expirations and `n` arguments must be integers in range, otherwise a `RangeError` is thrown (previously, values like `pageSize = 0` or `n = 0` silently selected the whole repository). Item ids must be non-empty strings.

## Redis Cluster
Both repositories support `Cluster` connections. `SortedItemRepository` stores its index and data under two keys. On standalone Redis, writes and deletes touching both keys run as a `MULTI` transaction. On Redis Cluster those keys live in different slots, so the commands run in a safe order instead (data before index on writes, index before data on deletes) and readers never observe indexed items without data. Set `hashTag: true` to keep both keys in the same slot and get atomic transactions on Cluster as well. Note that this changes the key layout (`items:{name}:`), so existing data stored without the option is not visible with it.

## Custom serialization
```ts
const repository = new ItemRepository<T>('json-repo', redis, {
  serializer: {
    encode: (item) => Buffer.from(JSON.stringify(item)),
    decode: (buffer) => JSON.parse(buffer.toString())
  }
})
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