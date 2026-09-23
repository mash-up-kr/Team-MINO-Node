import { describe, expect, it } from "bun:test";
import { isValidCommitMessage } from "./validate-commit-message";

describe("isValidCommitMessage", () => {
  it("accepts conventional commit subjects with supported types", () => {
    expect(isValidCommitMessage("docs: 꾹(GGUK) 제품명 표기 통일")).toBe(true);
    expect(isValidCommitMessage("fix(api): handle missing place")).toBe(true);
    expect(isValidCommitMessage("feat!: remove deprecated endpoint")).toBe(
      true,
    );
  });

  it("rejects subjects outside the agreed format", () => {
    expect(isValidCommitMessage("[mono] 꾹 제품명 표기 통일")).toBe(false);
    expect(isValidCommitMessage("fix:")).toBe(false);
    expect(isValidCommitMessage("update: change behavior")).toBe(false);
  });

  it("allows Git-generated merge and revert subjects", () => {
    expect(
      isValidCommitMessage("Merge pull request #12 from mash-up-kr/feature"),
    ).toBe(true);
    expect(isValidCommitMessage("Merge branch 'main' into feature")).toBe(true);
    expect(isValidCommitMessage('Revert "feat: add feature"')).toBe(true);
  });

  it("rejects subjects that only look like merge messages", () => {
    expect(isValidCommitMessage("Merge this feature")).toBe(false);
  });
});
