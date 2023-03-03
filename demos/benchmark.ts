import { ItemRepository, SortedItemRepository } from '../libs'
import { Redis } from 'ioredis'
import { SortedItem } from '../libs/model'

const redis = new Redis({ host: 'localhost', port: 6379 })
const repository = new ItemRepository('unsorted', redis)
const sortedRepository = new SortedItemRepository('sorted', redis)

async function benchUnsorted(): Promise<void> {
  for (let index = 0; index <= 100_000; index++) {
    const item = new SortedItem(index)
    await repository.set(item)
  }

  for (let page = 1; page < 1000; page++) {
    await repository.getPaginated(page, 100)
  }
}

async function benchSorted(): Promise<void> {
  for (let index = 0; index <= 100_000; index++) {
    const item = new SortedItem(index)
    await sortedRepository.add(item)
  }

  for (let page = 1; page < 1000; page++) {
    await sortedRepository.getPaginated(page, 100)
  }
}

async function run(): Promise<void> {
  await repository.deleteAll()
  await sortedRepository.deleteAll()

  const startSorted = new Date().getTime()
  await benchSorted()
  console.log(`Sorted timeout ${new Date().getTime() - startSorted} ms`)

  const startUnsorted = new Date().getTime()
  await benchUnsorted()
  console.log(`Unsorted timeout ${new Date().getTime() - startUnsorted} ms`)

  redis.disconnect()
}

run().catch(console.log)
