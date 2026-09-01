import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/deploy.yml"),
  "utf8",
);
const secretsInfrastructure = readFileSync(
  resolve(process.cwd(), "infra/src/resources/secrets.ts"),
  "utf8",
);

describe("production deployment workflow", () => {
  it("runs pending Drizzle migrations before deploying the server", () => {
    expect(workflow).toContain("  db-migrate:");
    expect(workflow).toContain("run: bun run db:migrate");
    expect(workflow).toMatch(
      /server-deploy:\n {4}needs: \[changes, infra-deploy, server-build, db-migrate\]/,
    );
    expect(workflow).toContain("needs.db-migrate.result == 'success'");
  });

  it("grants the CI service account access to the production environment secret", () => {
    expect(secretsInfrastructure).toContain(
      'new gcp.secretmanager.SecretIamMember("team-mino-env-prod-ci-read",',
    );
    expect(secretsInfrastructure).toContain("member: ciMember,");
  });
});
