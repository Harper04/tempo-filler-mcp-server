/**
 * Integration test for the get_schedule MCP tool handler
 *
 * Tests the full stack: tool → TempoClient → real API
 * Verifies CallToolResult shape, JSON payload structure, and schedule day fields.
 *
 * Run:
 *   npm test
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { config as loadEnv } from "dotenv";
import { TempoClient } from "../src/tempo-client.js";
import { getSchedule } from "../src/tools/get-schedule.js";

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

// Use a past month with known working days to keep assertions stable
const today = new Date();
const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
const endDate = today.toISOString().slice(0, 10);

describe("get_schedule tool", () => {
  let client: TempoClient;

  before(() => {
    client = getClient();
  });

  it("returns isError: false on success", async () => {
    const result = await getSchedule(client, { startDate, endDate });
    assert.equal(result.isError, false, `Tool returned error: ${result.content[0]?.text}`);
  });

  it("content[0] is parseable JSON", async () => {
    const result = await getSchedule(client, { startDate, endDate });
    assert.equal(result.content[0].type, "text");
    const parsed = JSON.parse(result.content[0].text as string);
    assert.ok(parsed, "Should parse without throwing");
    console.log(`  → summary: ${JSON.stringify(parsed.summary)}`);
  });

  it("response has expected top-level shape", async () => {
    const result = await getSchedule(client, { startDate, endDate });
    const data = JSON.parse(result.content[0].text as string);

    assert.equal(data.startDate, startDate);
    assert.equal(data.endDate, endDate);
    assert.ok(Array.isArray(data.days), "days should be an array");
    assert.ok(typeof data.summary === "object", "summary should be an object");
    assert.ok(typeof data.summary.totalDays === "number", "totalDays should be a number");
    assert.ok(typeof data.summary.workingDays === "number", "workingDays should be a number");
    assert.ok(typeof data.summary.nonWorkingDays === "number", "nonWorkingDays should be a number");
    assert.ok(typeof data.summary.totalRequiredHours === "number", "totalRequiredHours should be a number");
    assert.ok(typeof data.summary.averageDailyHours === "number", "averageDailyHours should be a number");
  });

  it("days.length matches summary.totalDays", async () => {
    const result = await getSchedule(client, { startDate, endDate });
    const data = JSON.parse(result.content[0].text as string);

    assert.equal(data.days.length, data.summary.totalDays,
      `days.length (${data.days.length}) should equal summary.totalDays (${data.summary.totalDays})`);
    console.log(`  → ${data.summary.totalDays} days: ${data.summary.workingDays} working, ${data.summary.nonWorkingDays} non-working`);
  });

  it("working + non-working days sum to totalDays", async () => {
    const result = await getSchedule(client, { startDate, endDate });
    const data = JSON.parse(result.content[0].text as string);

    assert.equal(
      data.summary.workingDays + data.summary.nonWorkingDays,
      data.summary.totalDays,
      `workingDays(${data.summary.workingDays}) + nonWorkingDays(${data.summary.nonWorkingDays}) !== totalDays(${data.summary.totalDays})`
    );
  });

  it("each day has required fields with correct types", async () => {
    const result = await getSchedule(client, { startDate, endDate });
    const data = JSON.parse(result.content[0].text as string);

    assert.ok(data.days.length > 0, "Expected at least one day in range");

    for (const day of data.days) {
      assert.ok(
        typeof day.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.date),
        `date should be YYYY-MM-DD, got "${day.date}"`
      );
      assert.ok(typeof day.dayOfWeek === "string" && day.dayOfWeek.length > 0,
        `dayOfWeek should be a non-empty string, got "${day.dayOfWeek}"`);
      assert.ok(typeof day.requiredHours === "number",
        `requiredHours should be a number, got ${typeof day.requiredHours}`);
      assert.ok(typeof day.isWorkingDay === "boolean",
        `isWorkingDay should be boolean, got ${typeof day.isWorkingDay}`);
    }

    console.log(`  → Validated ${data.days.length} schedule days`);
    console.log(`  → Sample: ${JSON.stringify(data.days[0])}`);
  });

  it("totalRequiredHours is positive for a range with working days", async () => {
    const result = await getSchedule(client, { startDate, endDate });
    const data = JSON.parse(result.content[0].text as string);

    if (data.summary.workingDays > 0) {
      assert.ok(data.summary.totalRequiredHours > 0,
        `totalRequiredHours should be > 0 when there are working days`);
      console.log(`  → totalRequiredHours: ${data.summary.totalRequiredHours}h (${data.summary.workingDays} working days)`);
    } else {
      console.log("  → Skipped: no working days in range");
    }
  });

  it("single-day query works correctly", async () => {
    // Pick a Monday (guaranteed working day in most schedules)
    const result = await getSchedule(client, { startDate, endDate: startDate });
    const data = JSON.parse(result.content[0].text as string);

    assert.equal(data.startDate, startDate);
    assert.equal(data.endDate, startDate);
    assert.equal(data.days.length, 1, "Single-day query should return exactly 1 day");
    assert.equal(data.summary.totalDays, 1);
    console.log(`  → Single day (${startDate}): ${data.days[0].dayOfWeek}, isWorkingDay=${data.days[0].isWorkingDay}`);
  });
});
