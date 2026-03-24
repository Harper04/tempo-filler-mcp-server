// JSON response types for MCP tools
// Per specs/json-tool-responses.md

// ============================================================================
// get_schedule Response Types
// ============================================================================

export interface ScheduleDayResponse {
  date: string;                // "2026-01-01" (ISO 8601)
  dayOfWeek: string;           // "Monday"
  requiredHours: number;       // 8 or 0
  isWorkingDay: boolean;
}

export interface ScheduleSummaryResponse {
  totalDays: number;
  workingDays: number;
  nonWorkingDays: number;
  totalRequiredHours: number;
  averageDailyHours: number;
}

export interface GetScheduleJsonResponse {
  startDate: string;           // "2026-01-01"
  endDate: string;             // "2026-01-31"
  days: ScheduleDayResponse[];
  summary: ScheduleSummaryResponse;
}

// ============================================================================
// get_worklogs Response Types
// ============================================================================

export interface WorklogResponse {
  id: string;
  issueKey: string;
  issueSummary: string;
  date: string;                // "2026-01-02" (ISO 8601)
  hours: number;               // decimal
  comment: string;
  worker: string;              // accountId (cloud) or username (legacy)
  workerDisplayName: string;   // human-readable name
  workerEmail: string;         // email address (empty string if unavailable)
}

export interface IssueAggregateResponse {
  issueKey: string;
  issueSummary: string;
  totalHours: number;
  entryCount: number;
}

export interface WorklogSummaryResponse {
  totalHours: number;
  totalEntries: number;
  uniqueIssues: number;
}

export interface GetWorklogsJsonResponse {
  startDate: string;
  endDate: string;
  issueFilter?: string;        // If filtered by issue
  projectFilter?: string;      // If filtered by project key
  workerFilter?: string;       // If filtered by specific worker
  allUsers?: boolean;          // If all-users query was requested
  worklogs: WorklogResponse[];
  byIssue: IssueAggregateResponse[];
  summary: WorklogSummaryResponse;
  schedule: ScheduleDayResponse[];  // For coverage-aware UI coloring
}

// ============================================================================
// post_worklog Response Types
// ============================================================================

export interface PostWorklogJsonResponse {
  success: true;
  worklog: {
    id: string;
    issueKey: string;
    issueSummary: string;
    date: string;
    hours: number;
    comment: string;
  };
}

// ============================================================================
// bulk_post_worklogs Response Types
// ============================================================================

export interface BulkWorklogResultResponse {
  date: string;
  issueKey: string;
  hours: number;
  success: boolean;
  worklogId?: string;          // Present if success
  error?: string;              // Present if failure
}

export interface BulkPostSummaryResponse {
  total: number;
  succeeded: number;
  failed: number;
  totalHours: number;
}

export interface BulkPostWorklogsJsonResponse {
  results: BulkWorklogResultResponse[];
  summary: BulkPostSummaryResponse;
}

// ============================================================================
// delete_worklog Response Types
// ============================================================================

export interface DeleteWorklogJsonResponse {
  success: true;
  deletedWorklogId: string;
}

// ============================================================================
// list_projects Response Types
// ============================================================================

export interface ProjectResponse {
  id: string;
  key: string;
  name: string;
}

export interface ListProjectsJsonResponse {
  projects: ProjectResponse[];
  summary: {
    totalProjects: number;
  };
}
