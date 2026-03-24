/**
 * Integration test for the get_worklogs MCP tool handler
 *
 * Tests the full stack: tool → TempoClient → real API
 * Verifies the CallToolResult shape and JSON payload structure.
 *
 * Run:
 *   npm test
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { config as loadEnv } from "dotenv";
import { TempoClient } from "../src/tempo-client.js";
import { getWorklogs } from "../src/tools/get-worklogs.js";

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

const today = new Date();
const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
const endDate = today.toISOString().slice(0, 10);

describe("get_worklogs tool", () => {
  let client: TempoClient;

  before(() => {
    client = getClient();
  });

  it("returns isError: false on success", async () => {
    const result = await getWorklogs(client, { startDate, endDate });
    assert.equal(result.isError, false, `Tool returned error: ${result.content[0]?.text}`);
  });

  it("content[0] is parseable JSON", async () => {
    const result = await getWorklogs(client, { startDate, endDate });
    assert.equal(result.content[0].type, "text");
    const parsed = JSON.parse(result.content[0].text as string);
    assert.ok(parsed, "Should parse without throwing");
    console.log(`  → summary: ${JSON.stringify(parsed.summary)}`);
  });

  it("response has expected top-level shape", async () => {
    const result = await getWorklogs(client, { startDate, endDate });
    const data = JSON.parse(result.content[0].text as string);

    assert.equal(data.startDate, startDate);
    assert.equal(data.endDate, endDate);
    assert.ok(Array.isArray(data.worklogs), "worklogs should be an array");
    assert.ok(Array.isArray(data.byIssue), "byIssue should be an array");
    assert.ok(Array.isArray(data.schedule), "schedule should be an array");
    assert.ok(typeof data.summary.totalHours === "number", "totalHours should be a number");
    assert.ok(typeof data.summary.totalEntries === "number", "totalEntries should be a number");
    assert.ok(typeof data.summary.uniqueIssues === "number", "uniqueIssues should be a number");
  });

  it("each worklog entry has required fields", async () => {
    const result = await getWorklogs(client, { startDate, endDate });
    const data = JSON.parse(result.content[0].text as string);

    if (data.worklogs.length === 0) {
      console.log("  → No worklogs in range to validate");
      return;
    }

    for (const w of data.worklogs) {
      assert.ok(typeof w.id === "string", `id should be string, got ${typeof w.id}`);
      assert.ok(typeof w.issueKey === "string", `issueKey should be string, got ${typeof w.issueKey}`);
      assert.ok(typeof w.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(w.date), `date should be YYYY-MM-DD, got "${w.date}"`);
      assert.ok(typeof w.hours === "number", `hours should be number, got ${typeof w.hours}`);
    }

    console.log(`  → Validated ${data.worklogs.length} worklog entries`);
    console.log(`  → Sample: ${JSON.stringify(data.worklogs[0])}`);
  });

  it("schedule array is populated (cloud normalization check)", async () => {
    const result = await getWorklogs(client, { startDate, endDate });
    const data = JSON.parse(result.content[0].text as string);

    // Schedule is fetched internally by the tool; verifies cloud /4/user-schedule normalization
    assert.ok(Array.isArray(data.schedule), "schedule should be an array");
    assert.ok(data.schedule.length > 0, "schedule should be non-empty for a range with working days");

    const day = data.schedule[0];
    assert.ok(typeof day.date === "string", "schedule day should have a date string");
    assert.ok(typeof day.isWorkingDay === "boolean", "schedule day should have isWorkingDay boolean");
    console.log(`  → Schedule has ${data.schedule.length} days; sample: ${JSON.stringify(data.schedule[0])}`);
  });

  it("byIssue aggregation totals match worklogs total", async () => {
    const result = await getWorklogs(client, { startDate, endDate });
    const data = JSON.parse(result.content[0].text as string);

    const sumFromWorklogs = Math.round(
      data.worklogs.reduce((acc: number, w: any) => acc + w.hours, 0) * 100
    ) / 100;
    const sumFromByIssue = Math.round(
      data.byIssue.reduce((acc: number, i: any) => acc + i.totalHours, 0) * 100
    ) / 100;

    assert.equal(sumFromByIssue, sumFromWorklogs, `byIssue total (${sumFromByIssue}h) should match worklogs total (${sumFromWorklogs}h)`);
    console.log(`  → Total hours: ${data.summary.totalHours}h across ${data.summary.uniqueIssues} issues`);
  });
});
