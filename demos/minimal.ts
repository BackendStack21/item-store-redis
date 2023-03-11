import { SortedItemRepository } from '../libs/index'
import Redis from 'ioredis'

const redis = new Redis({ host: 'localhost', port: 6379 })
const repository = new SortedItemRepository<string>('my-sorted-repo', redis)
async function run() {
  await repository.deleteAll()

  await repository.set({
    id: 'name',
    data: 'Rolando'
  })

  console.log(await repository.getById('name'))

  redis.disconnect()
}

run().catch(console.log)
