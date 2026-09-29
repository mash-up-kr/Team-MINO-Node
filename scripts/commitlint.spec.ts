import { describe, expect, it } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const cliJs = path.join(repoRoot, "node_modules/@commitlint/cli/lib/cli.js");

const runCommitlint = (message: string) => {
  const messageFile = path.join(
    repoRoot,
    `.commitlint-spec-${crypto.randomUUID()}.txt`,
  );
  writeFileSync(messageFile, `${message}\n`);
  try {
    const proc = Bun.spawnSync(["bun", cliJs, "--edit", messageFile], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = `${proc.stdout.toString()}\n${proc.stderr.toString()}`;
    return { exitCode: proc.exitCode ?? 1, output };
  } finally {
    rmSync(messageFile, { force: true });
  }
};

describe("commit-msg hook (commitlint)", () => {
  it("accepts conventional commit subjects with supported types", () => {
    expect(runCommitlint("docs: 꾹(GGUK) 제품명 표기 통일").exitCode).toBe(0);
    expect(runCommitlint("fix(api): handle missing place").exitCode).toBe(0);
    expect(runCommitlint("feat!: remove deprecated endpoint").exitCode).toBe(0);
  });

  it("rejects subjects outside the agreed format", () => {
    const missingType = runCommitlint("[mono] 꾹 제품명 표기 통일");
    expect(missingType.exitCode).toBe(1);
    expect(missingType.output).toContain("[type-empty]");

    const emptySubject = runCommitlint("fix:");
    expect(emptySubject.exitCode).toBe(1);
    expect(emptySubject.output).toContain("[subject-empty]");

    const unsupportedType = runCommitlint("update: change behavior");
    expect(unsupportedType.exitCode).toBe(1);
    expect(unsupportedType.output).toContain("[type-enum]");
  });

  it("accepts git-generated merge and revert subjects", () => {
    expect(
      runCommitlint("Merge pull request #12 from mash-up-kr/feature").exitCode,
    ).toBe(0);
    expect(runCommitlint("Merge branch 'main' into feature").exitCode).toBe(0);
    expect(runCommitlint('Revert "feat: add feature"').exitCode).toBe(0);
  });

  it("rejects subjects that only look like merge messages", () => {
    const fakeMerge = runCommitlint("Merge this feature");
    expect(fakeMerge.exitCode).toBe(1);
    expect(fakeMerge.output).toContain("[type-empty]");
  });
});
