const msgpack = require('@msgpack/msgpack')
const msgpackLite = require('msgpack-lite')

// Create a simple object to serialize
const obj = {
  items: [
    {
      _id: '640dc50292ca01f98a016b4d',
      index: 2,
      guid: 'b3f35fb6-0952-4bf3-adaf-ce1a65d16a10',
      isActive: true,
      balance: '$2,018.76',
      picture: 'http://placehold.it/32x32',
      age: 33,
      eyeColor: 'brown',
      name: 'Barnett Gutierrez',
      gender: 'male',
      company: 'CORPORANA',
      email: 'barnettgutierrez@corporana.com',
      phone: '+1 (895) 558-3341',
      address: '539 Woodside Avenue, Orovada, New York, 940',
      about:
        'Occaecat id eiusmod reprehenderit mollit consequat proident deserunt consectetur culpa. Voluptate voluptate minim irure occaecat sit Lorem adipisicing. Minim elit est aute esse elit non aute exercitation ad esse nulla. Est non laboris esse dolor.\r\n',
      registered: '2018-01-19T01:25:02 -01:00',
      latitude: 35.802909,
      longitude: -168.422781,
      tags: ['ut', 'occaecat', 'est', 'non', 'minim', 'aliquip', 'est'],
      friends: [
        {
          id: 0,
          name: 'Lacey Wise'
        },
        {
          id: 1,
          name: 'Juana Duffy'
        },
        {
          id: 2,
          name: 'Barnes Herrera'
        }
      ],
      greeting: 'Hello, Barnett Gutierrez! You have 8 unread messages.',
      favoriteFruit: 'banana'
    }
  ]
}

// Benchmark encoding using @msgpack/msgpack
console.time('@msgpack/msgpack encode')
let encoded
for (let i = 0; i < 10_000; i++) {
  encoded = msgpack.encode(obj)
}
console.timeEnd('@msgpack/msgpack encode')

// Benchmark decoding using @msgpack/msgpack
console.time('@msgpack/msgpack decode')
let decoded
for (let i = 0; i < 10_000; i++) {
  decoded = msgpack.decode(encoded)
}
console.timeEnd('@msgpack/msgpack decode')

// Benchmark encoding using msgpack-lite
console.time('msgpack-lite encode')
for (let i = 0; i < 10_000; i++) {
  encoded = msgpackLite.encode(obj)
}
console.timeEnd('msgpack-lite encode')

// Benchmark decoding using msgpack-lite
console.time('msgpack-lite decode')
for (let i = 0; i < 10_000; i++) {
  decoded = msgpackLite.decode(encoded)
}
console.timeEnd('msgpack-lite decode')
