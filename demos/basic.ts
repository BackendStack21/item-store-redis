import { ItemRepository, SortedItemRepository } from '../libs'
import Redis from 'ioredis'

const redis = new Redis({ host: 'localhost', port: 6379 })
const repository = new ItemRepository<number>('unsorted', redis)
const sortedRepository = new SortedItemRepository<number>('sorted', redis)

async function ops(): Promise<void> {
  for (let index = 0; index < 20; index++) {
    await repository.set({
      id: `Item-${index}`,
      data: index
    })
    await sortedRepository.set({
      id: `Item-${index}`,
      data: index
    })
  }

  console.log([
    await repository.getPaginated(1, 5),
    await repository.deleteAll(),
    await sortedRepository.getPaginated(1, 5),
    await sortedRepository.deleteAll()
  ])

  redis.disconnect()
}

ops().catch(console.log)
