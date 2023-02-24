import { ItemRepository, SortedItem, SortedItemRepository } from "../libs"
import Redis from "ioredis"

const redis = new Redis({ host: "localhost", port: 6379 })
const repository: ItemRepository = new ItemRepository("unsorted", redis)
const sortedRepository: SortedItemRepository = new SortedItemRepository("sorted", redis)

async function ops(): Promise<void> {
  for (let index = 0; index < 20; index++) {
    await repository.set(new SortedItem(index, `Item-${index}`))
    await sortedRepository.add(new SortedItem(index, `Item-${index}`))
  }

  console.log([
    await repository.getPaginated(1, 5),
    await repository.deleteAll(),
    await sortedRepository.getPaginated(1, 5),
    await sortedRepository.deleteAll(),
  ])

  redis.disconnect()
}

ops().catch(console.log)
