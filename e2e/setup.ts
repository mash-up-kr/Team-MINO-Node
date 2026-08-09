import { afterAll, beforeAll } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import EmbeddedPostgres from "embedded-postgres";

const probe = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () => new Response(),
});
const port = probe.port;
const url = `postgres://postgres:postgres@127.0.0.1:${port}/team_mino`;
const schema = "develop";
const migrations = join(process.cwd(), "drizzle");
const pg = new EmbeddedPostgres({
  databaseDir: join(tmpdir(), `team-mino-postgres-${randomUUID()}`),
  port,
  user: "postgres",
  password: "postgres",
  persistent: false,
  onLog: () => undefined,
});
const db = drizzle({
  connection: {
    url,
    max: 1,
    connection: { search_path: schema },
  },
});

// DB 설정은 임베디드 인스턴스에 묶여 있어 여기서 주입합니다(나머지는 .env.test).
process.env.DATABASE_URL = url;
process.env.DATABASE_SCHEMA = schema;

beforeAll(async () => {
  try {
    await pg.initialise();
  } finally {
    await probe.stop(true);
  }

  await pg.start();
  await pg.createDatabase("team_mino");

  if (existsSync(migrations)) {
    await migrate(db, {
      migrationsFolder: migrations,
      migrationsSchema: schema,
    });
  }
}, 30_000);

afterAll(async () => {
  await db.$client.end({ timeout: 5 });
  await pg.stop();
}, 30_000);
