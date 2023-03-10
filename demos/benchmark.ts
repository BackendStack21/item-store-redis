import { ItemRepository, SortedItemRepository } from '../libs'
import { Redis } from 'ioredis'

const redis = new Redis({ host: 'localhost', port: 6379 })
const repository = new ItemRepository('unsorted', redis)
const sortedRepository = new SortedItemRepository('sorted', redis)

async function benchUnsorted(): Promise<void> {
  for (let index = 0; index <= 10_000; index++) {
    await repository.set({
      id: `i${index}`,
      data: index
    })
  }

  const pagingStarted = new Date().getTime()
  for (let page = 1; page < 100; page++) {
    await repository.getPaginated(page, 100)
  }
  console.log(` - Paging timeout ${new Date().getTime() - pagingStarted} ms`)
}

async function benchSorted(): Promise<void> {
  for (let index = 0; index <= 10_000; index++) {
    await sortedRepository.set({
      id: `i${index}`,
      data: index
    })
  }

  const pagingStarted = new Date().getTime()
  for (let page = 1; page < 100; page++) {
    await sortedRepository.getPaginated(page, 100)
  }
  console.log(` - Paging timeout ${new Date().getTime() - pagingStarted} ms`)
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
