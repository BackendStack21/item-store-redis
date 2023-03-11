import { SortedItemRepository } from '../libs'
import Redis from 'ioredis'

const redis = new Redis({ host: 'localhost', port: 6379 })
const repository = new SortedItemRepository<number>('sorted', redis)

async function ops(): Promise<void> {
  await repository.deleteAll()

  for (let index = 0; index < 20; index++) {
    await repository.set({
      id: `Item-${index}`,
      data: index
    })
  }
  const min = (await repository.getItemScoreById('Item-0')) as number
  const fiveMilliseconds = 5 * 1000
  console.log([min, await repository.getItemsByScore(min + 1, min + fiveMilliseconds)])

  redis.disconnect()
}

ops().catch(console.log)
