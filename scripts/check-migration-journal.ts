#!/usr/bin/env bun

/**
 * PR CI 가드: drizzle 저널 순서 검증.
 *
 * drizzle-kit migrator는 DB에 기록된 마지막 created_at보다
 * 오래된(`when`이 작은) 마이그레이션을 조용히 건너뛴다.
 * 뒤늦게 머지된 브랜치의 마이그레이션이 이런 식으로 누락되면
 * 잡은 성공으로 끝나고 배포까지 진행되지만 스키마는 반영되지 않는다.
 * (배포 자동화 이후에는 사람이 눈치챌 기회가 없으므로 CI에서 막는다.)
 *
 * 검사:
 * 1. 저널의 `when`이 엄격히 증가 + 중복 없음.
 * 2. 베이스 브랜치(origin/<base>)에 없는 새 항목은 베이스의 최대 `when`보다
 *    커야 한다. (베이스 저널을 못 읽으면 1번만 검사하고 경고한다.)
 *
 * 사용: PR CI에서 `git fetch origin <base> --depth=1` 후에 실행한다.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

type JournalEntry = { idx: number; when: number; tag: string };

function fail(message: string): never {
  console.error(`migration journal check failed: ${message}`);
  process.exit(1);
}

function readLocalJournal(): JournalEntry[] {
  const raw = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: JournalEntry[] };
  return raw.entries;
}

const entries = readLocalJournal();
const whens = entries.map((entry) => entry.when);
for (let index = 1; index < whens.length; index += 1) {
  if (whens[index]! <= whens[index - 1]!) {
    fail(
      `entries[${index}] (tag=${entries[index]!.tag}, when=${whens[index]}) ` +
        `is not newer than the previous entry (when=${whens[index - 1]}). ` +
        `Regenerate or rebase the migration so journal order matches apply order.`,
    );
  }
}

const baseRef = process.env.GITHUB_BASE_REF;
if (!baseRef) {
  console.log(
    "GITHUB_BASE_REF is empty (push event?). Skipped cross-branch check.",
  );
  process.exit(0);
}

let baseEntries: JournalEntry[];
try {
  const baseRaw = execSync(
    `git show origin/${baseRef}:drizzle/meta/_journal.json`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  baseEntries = (JSON.parse(baseRaw) as { entries: JournalEntry[] }).entries;
} catch {
  console.log(
    `Could not read origin/${baseRef} journal. Skipped cross-branch check.`,
  );
  process.exit(0);
}

const baseTags = new Set(baseEntries.map((entry) => entry.tag));
const baseMax = Math.max(...baseEntries.map((entry) => entry.when));
for (const entry of entries) {
  if (!baseTags.has(entry.tag) && entry.when <= baseMax) {
    fail(
      `new migration ${entry.tag} (when=${entry.when}) is older than ` +
        `base max when=${baseMax}. drizzle-kit would silently skip it. ` +
        `Rebase onto ${baseRef} and regenerate the migration timestamp.`,
    );
  }
}

console.log("migration journal order looks good.");
