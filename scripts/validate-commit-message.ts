import { readFileSync } from "node:fs";

const conventionalCommitPattern =
  /^(feat|fix|docs|refactor|test|chore|ci|build|perf|revert)(?:\([A-Za-z0-9][A-Za-z0-9-]*\))?!?:\s+\S.*$/;
const gitMergeSubjectPattern =
  /^Merge (?:pull request #\d+ from \S+|(?:remote-tracking )?branch ['"][^'"]+['"](?: into .+| of \S+)?|tag ['"][^'"]+['"] into .+)$/;

export function isValidCommitMessage(message: string): boolean {
  const subject = message.split(/\r?\n/, 1)[0]?.trim() ?? "";

  if (gitMergeSubjectPattern.test(subject) || /^Revert ".+"$/.test(subject)) {
    return true;
  }

  return conventionalCommitPattern.test(subject);
}

const entryPoint = process.argv[1]?.replaceAll("\\", "/") ?? "";
if (
  entryPoint === "scripts/validate-commit-message.ts" ||
  entryPoint.endsWith("/scripts/validate-commit-message.ts")
) {
  const messageFilePath = process.argv[2];

  if (!messageFilePath) {
    console.error(
      "Usage: bun run scripts/validate-commit-message.ts <commit-message-file>",
    );
    process.exit(2);
  }

  let message: string;
  try {
    message = readFileSync(messageFilePath, "utf8");
  } catch {
    console.error(`Could not read commit message file: ${messageFilePath}`);
    process.exit(2);
  }

  if (!isValidCommitMessage(message)) {
    console.error(
      "Invalid commit message. Use <type>(optional-scope): <subject>, e.g. docs: update API docs.",
    );
    process.exit(1);
  }
}
