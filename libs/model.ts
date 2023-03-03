import { monotonicFactory, decodeTime } from 'ulidx'
import { Redis, Cluster } from 'ioredis'
const ulid = monotonicFactory()

export interface IItem {
  id: string
  data: unknown
}

export class SortedItem implements IItem {
  public readonly score: number

  constructor(public readonly data: unknown, public readonly id: string = ulid()) {
    this.score = decodeTime(ulid())
  }
}

export interface IPaginatedItems {
  items: IItem[]
  count: number
}

export interface IItemRepository {
  name: string
  redis: Redis | Cluster
  set: (item: IItem, expirationInSeconds?: number) => Promise<void>
  getById: (id: string) => Promise<IItem | null>
  getAll: () => Promise<IItem[]>
  getPaginated: (page: number, pageSize: number) => Promise<IPaginatedItems>
  hasItem: (id: string) => Promise<boolean>
  deleteById: (id: string) => Promise<void>
  deleteAll: () => Promise<void>
}

export interface ISortedItemRepository {
  name: string
  redis: Redis | Cluster
  add: (item: SortedItem) => Promise<void>
  updateById: (id: string, data: unknown) => Promise<boolean>
  getById: (id: string) => Promise<IItem | null>
  getAll: () => Promise<IItem[]>
  getPaginated: (page: number, pageSize: number) => Promise<IPaginatedItems>
  deletePage: (page: number, pageSize: number) => Promise<void>
  hasItem: (id: string) => Promise<boolean>
  deleteById: (id: string) => Promise<void>
  deleteAll: () => Promise<void>
  count: () => Promise<number>
}
