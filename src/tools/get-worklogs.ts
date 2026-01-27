import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { TempoClient } from "../tempo-client.js";
import {
  GetWorklogsInput,
  TempoWorklogResponse,
  GetWorklogsJsonResponse,
  WorklogResponse,
  IssueAggregateResponse
} from "../types/index.js";

/**
 * Get worklogs tool implementation
 * Retrieves worklogs for authenticated user and date range, with optional issue filtering
 */
export async function getWorklogs(
  tempoClient: TempoClient,
  input: GetWorklogsInput
): Promise<CallToolResult> {
  try {
    const { startDate, endDate, issueKey } = input;
    
    // Use endDate or default to startDate
    const actualEndDate = endDate || startDate;
    
    // Fetch worklogs from Tempo API (automatically filters by authenticated user)
    const worklogResponses = await tempoClient.getWorklogs({
      from: startDate,
      to: actualEndDate,
      issueKey: issueKey
    });

    // Process and format the worklogs
    const worklogs: WorklogResponse[] = worklogResponses.map((response: TempoWorklogResponse) => {
      // Extract date part from datetime string (handles both "2025-09-12 00:00:00.000" and "2025-09-12T00:00:00.000")
      const datePart = response.started.split(/[T\s]/)[0];

      return {
        id: response.tempoWorklogId?.toString() || response.id || 'unknown',
        issueKey: response.issue.key,
        issueSummary: response.issue.summary,
        date: datePart,
        hours: Math.round((response.timeSpentSeconds / 3600) * 100) / 100,
        comment: response.comment || ''
      };
    });

    // Calculate total hours
    const totalHours = Math.round(worklogs.reduce((sum, worklog) => sum + worklog.hours, 0) * 100) / 100;

    // Group by issue for aggregation
    const issueMap = new Map<string, { issueSummary: string; totalHours: number; entryCount: number }>();
    for (const worklog of worklogs) {
      const existing = issueMap.get(worklog.issueKey);
      if (existing) {
        existing.totalHours += worklog.hours;
        existing.entryCount += 1;
      } else {
        issueMap.set(worklog.issueKey, {
          issueSummary: worklog.issueSummary,
          totalHours: worklog.hours,
          entryCount: 1
        });
      }
    }

    // Build byIssue aggregation
    const byIssue: IssueAggregateResponse[] = Array.from(issueMap.entries()).map(([key, data]) => ({
      issueKey: key,
      issueSummary: data.issueSummary,
      totalHours: Math.round(data.totalHours * 100) / 100,
      entryCount: data.entryCount
    }));

    // Return JSON response
    const response: GetWorklogsJsonResponse = {
      startDate,
      endDate: actualEndDate,
      ...(issueKey && { issueFilter: issueKey }),
      worklogs,
      byIssue,
      summary: {
        totalHours,
        totalEntries: worklogs.length,
        uniqueIssues: issueMap.size
      }
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response)
        }
      ],
      isError: false
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return {
      content: [
        {
          type: "text",
          text: `Error retrieving worklogs: ${errorMessage}`
        }
      ],
      isError: true
    };
  }
}