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
    connection: { search_path: "develop" },
  },
});

Object.assign(process.env, {
  APP_BASE_URL: "http://localhost:3000",
  CLOUD_TASKS_INVOKER_EMAIL:
    "test-invoker@team-mino-test.iam.gserviceaccount.com",
  CLOUD_TASKS_LOCATION: "asia-northeast3",
  CLOUD_TASKS_QUEUE: "test-queue",
  DATABASE_SCHEMA: "develop",
  DATABASE_URL: url,
  GOOGLE_CLOUD_PROJECT: "team-mino-test",
  INSTAGRAM_APP_ID: "test",
  INSTAGRAM_DOC_ID: "test",
  INSTAGRAM_GRAPHQL_ENDPOINT: "https://www.instagram.com/api/graphql",
  INSTAGRAM_USER_AGENT: "test",
  KAKAO_REST_API_KEY: "test",
  NODE_ENV: "test",
});

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
      migrationsSchema: "develop",
    });
  }
}, 30_000);

afterAll(async () => {
  await db.$client.end({ timeout: 5 });
  await pg.stop();
}, 30_000);
