import { Redis, Cluster } from 'ioredis'

export interface IItem<T> {
  id: string
  data: T
}

export interface IPaginatedItems<T> {
  items: IItem<T>[]
  count: number
}

export interface IItemRepository<T> {
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

export interface ISortedItemRepository<T> {
  name: string
  redis: Redis | Cluster
  set: (item: IItem<T>) => Promise<void>
  getById: (id: string) => Promise<IItem<T> | null>
  getAll: () => Promise<IItem<T>[]>
  getPaginated: (page: number, pageSize: number) => Promise<IPaginatedItems<T>>
  getItemScoreById: (id: string) => Promise<number | null>
  getItemsByScore: (min: number, max: number) => Promise<IItem<T>[]>
  deletePage: (page: number, pageSize: number) => Promise<void>
  hasItem: (id: string) => Promise<boolean>
  deleteById: (id: string) => Promise<void>
  deleteAll: () => Promise<void>
  count: () => Promise<number>
}
