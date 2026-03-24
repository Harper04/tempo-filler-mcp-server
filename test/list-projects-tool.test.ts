/**
 * Integration test for the list_projects MCP tool handler
 *
 * Tests the full stack: tool → TempoClient → real Jira API
 * Verifies the CallToolResult shape and JSON payload structure.
 *
 * Run:
 *   npm test
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { config as loadEnv } from "dotenv";
import { TempoClient } from "../src/tempo-client.js";
import { listProjects } from "../src/tools/list-projects.js";

loadEnv();

function getClient() {
  const baseUrl = process.env.TEMPO_BASE_URL;
  const pat = process.env.TEMPO_PAT;
  if (!baseUrl || !pat) throw new Error("TEMPO_BASE_URL and TEMPO_PAT must be set in .env");
  const jiraBaseUrl = process.env.JIRA_BASE_URL;
  return new TempoClient({
    baseUrl,
    personalAccessToken: pat,
    ...(jiraBaseUrl && {
      jiraBaseUrl,
      jiraEmail: process.env.JIRA_EMAIL,
      jiraApiToken: process.env.JIRA_API_TOKEN,
    }),
  });
}

describe("list_projects tool", () => {
  let client: TempoClient;

  before(() => {
    client = getClient();
  });

  it("returns isError: false on success", async () => {
    const result = await listProjects(client, {});
    assert.equal(result.isError, false, `Tool returned error: ${result.content[0]?.text}`);
  });

  it("content[0] is parseable JSON", async () => {
    const result = await listProjects(client, {});
    assert.equal(result.content[0].type, "text");
    const parsed = JSON.parse(result.content[0].text as string);
    assert.ok(parsed, "Should parse without throwing");
  });

  it("response has expected top-level shape", async () => {
    const result = await listProjects(client, {});
    const data = JSON.parse(result.content[0].text as string);

    assert.ok(Array.isArray(data.projects), "projects should be an array");
    assert.ok(typeof data.summary === "object", "summary should be an object");
    assert.ok(typeof data.summary.totalProjects === "number", "totalProjects should be a number");
  });

  it("projects array is non-empty", async () => {
    const result = await listProjects(client, {});
    const data = JSON.parse(result.content[0].text as string);

    assert.ok(data.projects.length > 0, "Should have at least one project");
    console.log(`  → Found ${data.projects.length} projects`);
  });

  it("each project has required fields", async () => {
    const result = await listProjects(client, {});
    const data = JSON.parse(result.content[0].text as string);

    for (const p of data.projects) {
      assert.ok(typeof p.id === "string" && p.id.length > 0, `id should be non-empty string, got "${p.id}"`);
      assert.ok(typeof p.key === "string" && p.key.length > 0, `key should be non-empty string, got "${p.key}"`);
      assert.ok(typeof p.name === "string" && p.name.length > 0, `name should be non-empty string, got "${p.name}"`);
    }

    console.log(`  → Sample: ${JSON.stringify(data.projects[0])}`);
  });

  it("summary.totalProjects matches projects.length", async () => {
    const result = await listProjects(client, {});
    const data = JSON.parse(result.content[0].text as string);

    assert.equal(data.summary.totalProjects, data.projects.length,
      `totalProjects (${data.summary.totalProjects}) should equal projects.length (${data.projects.length})`);
  });
});
