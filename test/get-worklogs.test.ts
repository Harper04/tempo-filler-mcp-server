/**
 * Integration test for getWorklogs — requires real credentials in .env
 *
 * Run:
 *   npm test
 *
 * Covers:
 *  - Cloud mode: date-based query (GET /4/worklogs)
 *  - Cloud mode: issue-specific query (GET /rest/api/3/issue/{key}/worklog via Jira)
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { config as loadEnv } from "dotenv";
import { TempoClient } from "../src/tempo-client.js";

loadEnv(); // loads .env from project root

function getConfig() {
  const baseUrl = process.env.TEMPO_BASE_URL;
  const pat = process.env.TEMPO_PAT;
  if (!baseUrl || !pat) throw new Error("TEMPO_BASE_URL and TEMPO_PAT must be set in .env");

  const jiraBaseUrl = process.env.JIRA_BASE_URL;
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraApiToken = process.env.JIRA_API_TOKEN;

  return {
    baseUrl,
    personalAccessToken: pat,
    ...(jiraBaseUrl && { jiraBaseUrl, jiraEmail, jiraApiToken }),
  };
}

// Date range: current month
const today = new Date();
const from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
const to = today.toISOString().slice(0, 10);

describe("TempoClient.getWorklogs", () => {
  let client: TempoClient;

  before(() => {
    client = new TempoClient(getConfig());
  });

  it("returns an array for a date range query", async () => {
    const worklogs = await client.getWorklogs({ from, to });
    assert.ok(Array.isArray(worklogs), "Expected an array of worklogs");
    console.log(`  → Found ${worklogs.length} worklogs from ${from} to ${to}`);
  });

  it("returns an array for an issue-specific query", async () => {
    const issueKey = process.env.TEST_ISSUE_KEY;
    if (!issueKey) {
      console.log("  → Skipped: set TEST_ISSUE_KEY in .env to run this test");
      return;
    }
    const worklogs = await client.getWorklogs({ from, to, issueKey });
    assert.ok(Array.isArray(worklogs), "Expected an array of worklogs");
    console.log(`  → Found ${worklogs.length} worklogs for ${issueKey}`);
  });

  it("each worklog has expected shape", async () => {
    const worklogs = await client.getWorklogs({ from, to });
    if (worklogs.length === 0) {
      console.log("  → No worklogs in range to validate shape");
      return;
    }
    const w = worklogs[0];
    assert.ok(typeof w.timeSpentSeconds === "number", "timeSpentSeconds should be a number");
    assert.ok(w.started || w.startDate, "should have a started or startDate field");
    console.log(`  → Sample worklog: ${JSON.stringify(w, null, 2)}`);
  });
});
