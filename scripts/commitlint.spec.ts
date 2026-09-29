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
    return proc.exitCode ?? 1;
  } finally {
    rmSync(messageFile, { force: true });
  }
};

describe("commit-msg hook (commitlint)", () => {
  it("accepts conventional commit subjects with supported types", () => {
    expect(runCommitlint("docs: 꾹(GGUK) 제품명 표기 통일")).toBe(0);
    expect(runCommitlint("fix(api): handle missing place")).toBe(0);
    expect(runCommitlint("feat!: remove deprecated endpoint")).toBe(0);
  });

  it("rejects subjects outside the agreed format", () => {
    expect(runCommitlint("[mono] 꾹 제품명 표기 통일")).toBe(1);
    expect(runCommitlint("fix:")).toBe(1);
    expect(runCommitlint("update: change behavior")).toBe(1);
  });

  it("accepts git-generated merge and revert subjects", () => {
    expect(
      runCommitlint("Merge pull request #12 from mash-up-kr/feature"),
    ).toBe(0);
    expect(runCommitlint("Merge branch 'main' into feature")).toBe(0);
    expect(runCommitlint('Revert "feat: add feature"')).toBe(0);
  });

  it("rejects subjects that only look like merge messages", () => {
    expect(runCommitlint("Merge this feature")).toBe(1);
  });
});
