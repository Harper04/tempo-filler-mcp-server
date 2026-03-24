import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { format, parseISO } from "date-fns";
import { TempoClient } from "../tempo-client.js";
import {
  GetScheduleInput,
  TempoScheduleResponse,
  GetScheduleJsonResponse,
  ScheduleDayResponse
} from "../types/index.js";

/**
 * Get schedule tool implementation
 * Retrieves work schedule for authenticated user and date range
 * Shows working days, non-working days, and expected hours per day
 */
export async function getSchedule(
  tempoClient: TempoClient,
  input: GetScheduleInput,
  uiHtml?: string
): Promise<CallToolResult> {
  try {
    const { startDate, endDate, worker } = input;

    // Use endDate or default to startDate
    const actualEndDate = endDate || startDate;

    // Fetch schedule from Tempo API
    const scheduleResponses = await tempoClient.getSchedule({
      startDate,
      endDate: actualEndDate,
      worker
    });

    if (!scheduleResponses || scheduleResponses.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No schedule data found for the specified date range."
          }
        ],
        isError: true
      };
    }

    // Process the first schedule response (should contain the authenticated user's schedule)
    const scheduleResponse: TempoScheduleResponse = scheduleResponses[0];
    const { schedule } = scheduleResponse;

    // Process and format the schedule days
    const scheduleDays: ScheduleDayResponse[] = schedule.days.map((day) => {
      const parsedDate = parseISO(day.date);
      const dayOfWeek = format(parsedDate, "EEEE");

      return {
        date: day.date,
        dayOfWeek,
        requiredHours: Math.round((day.requiredSeconds / 3600) * 100) / 100, // Round to 2 decimal places
        isWorkingDay: day.type === "WORKING_DAY"
      };
    });

    // Calculate summary statistics
    const totalDays = scheduleDays.length;
    const workingDays = scheduleDays.filter(day => day.isWorkingDay).length;
    const nonWorkingDays = totalDays - workingDays;
    const totalRequiredHours = Math.round((schedule.requiredSeconds / 3600) * 100) / 100;
    const averageDailyHours = workingDays > 0 ? Math.round((totalRequiredHours / workingDays) * 100) / 100 : 0;

    // Return JSON response
    const response: GetScheduleJsonResponse = {
      startDate,
      endDate: actualEndDate,
      days: scheduleDays,
      summary: {
        totalDays,
        workingDays,
        nonWorkingDays,
        totalRequiredHours,
        averageDailyHours
      }
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response)
        }
      ],
      structuredContent: response as unknown as Record<string, unknown>,
      isError: false
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Provide more helpful error messages for common issues
    let enhancedErrorMessage = errorMessage;
    if (errorMessage.includes('Authentication failed')) {
      enhancedErrorMessage += `\n\nTip: Check your Personal Access Token (PAT) in the TEMPO_PAT environment variable.`;
    } else if (errorMessage.includes('Access forbidden')) {
      enhancedErrorMessage += `\n\nTip: Make sure you have permission to access schedule data in Tempo.`;
    } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      enhancedErrorMessage = `Schedule endpoint not found. Verify that Tempo is properly configured and the schedule API is accessible.\n\nTip: For Atlassian Cloud ensure TEMPO_BASE_URL=https://api.tempo.io. For self-hosted, verify the Tempo Core plugin is installed.`;
    }

    return {
      content: [
        {
          type: "text",
          text: `## Error Retrieving Schedule\n\n**Date Range:** ${input.startDate}${input.endDate ? ` to ${input.endDate}` : ''}\n\n**Error:** ${enhancedErrorMessage}`
        }
      ],
      isError: true
    };
  }
}