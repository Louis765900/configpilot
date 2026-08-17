import postgres, { type Sql } from 'postgres'

let client: Sql | null = null

export function getDatabase(): Sql {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL manquante. Copiez .env.example et configurez PostgreSQL.')
  if (!client) {
    client = postgres(url, {
      max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
      ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
      transform: { undefined: null },
    })
  }
  return client
}

export async function closeDatabase() {
  if (client) await client.end({ timeout: 5 })
  client = null
}
