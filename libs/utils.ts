import { Redis, Cluster } from 'ioredis'
import { encode, decode } from '@msgpack/msgpack'
import { IItem, ISerializer } from './model'

export function createMsgpackSerializer<T>(): ISerializer<T> {
  return {
    encode: (item: IItem<T>) => {
      const bytes = encode(item)
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    },
    decode: (buffer: Buffer) => decode(buffer) as IItem<T>
  }
}

export function toBuffer(value: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(value) ? value : Buffer.from(value.buffer, value.byteOffset, value.byteLength)
}

export function isCluster(redis: Redis | Cluster): boolean {
  return redis.isCluster === true
}

// Escapes Redis glob special characters so a repository name is matched literally.
export function escapeGlob(value: string): string {
  return value.replace(/[*?[\]\\]/g, '\\$&')
}

let lastScore = 0

/**
 * Returns a wall-clock based score (microseconds since epoch) that is strictly increasing within the process.
 * Stays below Number.MAX_SAFE_INTEGER, so it is stored by Redis without precision loss.
 */
export function nextScore(): number {
  const now = Date.now() * 1000
  lastScore = now > lastScore ? now : lastScore + 1

  return lastScore
}

export function assertId(id: unknown): void {
  if (typeof id !== 'string' || id.length === 0) {
    throw new TypeError('Item id must be a non-empty string')
  }
}

export function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`)
  }
}

export function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`)
  }
}

export function assertInteger(value: number, name: string): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${name} must be an integer`)
  }
}

export function pageBounds(page: number, pageSize: number): [number, number] {
  assertPositiveInteger(page, 'page')
  assertPositiveInteger(pageSize, 'pageSize')
  const start = (page - 1) * pageSize

  return [start, start + pageSize - 1]
}

export function notNull<V>(value: V | null): value is V {
  return value !== null
}

export function chunk<V>(values: V[], size: number): V[][] {
  const chunks: V[][] = []
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size))
  }

  return chunks
}
