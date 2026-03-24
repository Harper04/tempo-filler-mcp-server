import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { TempoClient } from "../tempo-client.js";
import { ListProjectsInput, ListProjectsJsonResponse } from "../types/index.js";

/**
 * List projects tool implementation
 * Returns all Jira projects accessible to the authenticated user
 */
export async function listProjects(
  tempoClient: TempoClient,
  input: ListProjectsInput
): Promise<CallToolResult> {
  try {
    const projects = await tempoClient.getProjects();

    const response: ListProjectsJsonResponse = {
      projects: projects.map(p => ({ id: p.id, key: p.key, name: p.name })),
      summary: {
        totalProjects: projects.length
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
          text: `Error listing projects: ${errorMessage}`
        }
      ],
      isError: true
    };
  }
}
