const { SortedItemRepository, SortedItem } = require('item-store-redis')
const { Redis } = require('ioredis')

const redis = new Redis({ host: 'localhost', port: 6379 })
const repository = new SortedItemRepository('my-sorted-repo', redis)

async function run() {
  await repository.deleteAll()

  const itemWithUniqueKey = new SortedItem('My 1st item data!')
  await repository.add(itemWithUniqueKey)

  const itemWithCustomKey = new SortedItem('My 2nd item data!', 'my-key-1')
  await repository.add(itemWithCustomKey)

  await repository.getPaginated(1, 10)
  console.log(await repository.getPaginated(1, 10))

  redis.disconnect()
}

run().catch(console.log)
