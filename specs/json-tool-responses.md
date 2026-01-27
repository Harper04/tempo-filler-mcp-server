# Product Specification: JSON Tool Responses

## Overview

This spec converts TempoFiller's MCP tool responses from pre-formatted markdown to structured JSON. This provides a clean, single-format response that AI hosts can interpret for users while enabling programmatic consumption of tool data.

### Rationale

**Current state:** Tools return markdown-formatted text optimized for human reading.

**Problem:**
- Markdown responses are difficult to parse programmatically
- Returning both markdown AND JSON doubles token usage
- Parsing markdown back to structured data is fragile

**Solution:** Return JSON only. AI hosts format responses conversationally for users based on the structured data.

## Goals

- Standardize all tool responses as structured JSON
- Enable programmatic consumption of tool response data
- Maintain equivalent information density for users
- Reduce response format complexity

## Requirements

### Functional Requirements

**All Tools:**
- **FR1**: Return structured JSON instead of markdown text
- **FR2**: Include all data currently present in markdown responses
- **FR3**: Use consistent date format (ISO 8601: `YYYY-MM-DD`)
- **FR4**: Use consistent time format (hours as decimal numbers)
- **FR5**: Include summary/aggregate data alongside detail data

**`get_schedule`:**
- **FR6**: Return array of day objects with date, requiredHours, isWorkingDay
- **FR7**: Return summary object with totalDays, workingDays, nonWorkingDays, totalRequiredHours

**`get_worklogs`:**
- **FR8**: Return array of worklog objects with id, issueKey, issueSummary, date, hours, comment
- **FR9**: Return summary object with totalHours, totalEntries
- **FR10**: Return byIssue aggregation with hours and entry count per issue

**`post_worklog`:**
- **FR11**: Return created worklog object with id, issueKey, date, hours

**`bulk_post_worklogs`:**
- **FR12**: Return array of results (success/failure per entry)
- **FR13**: Return summary with successCount, failureCount, totalHours

**`delete_worklog`:**
- **FR14**: Return deleted worklog id and confirmation status

### Non-Functional Requirements

- **NFR1**: Response size should not exceed current markdown responses significantly
- **NFR2**: JSON should be parseable without custom logic (standard `JSON.parse()`)
- **NFR3**: Schema should be self-documenting (clear field names)

### Technical Constraints

- **TC1**: Must maintain backwards compatibility with existing MCP tool contracts (same inputs)
- **TC2**: Response must be valid JSON in the `content[].text` field
- **TC3**: Use TypeScript interfaces for all response types
- **TC4**: Keep existing error response format (text error messages)

## JSON Schemas

### `get_schedule` Response

```typescript
interface GetScheduleResponse {
  startDate: string;           // "2026-01-01"
  endDate: string;             // "2026-01-31"
  days: ScheduleDay[];
  summary: ScheduleSummary;
}

interface ScheduleDay {
  date: string;                // "2026-01-01"
  dayOfWeek: string;           // "Monday"
  requiredHours: number;       // 8 or 0
  isWorkingDay: boolean;
}

interface ScheduleSummary {
  totalDays: number;
  workingDays: number;
  nonWorkingDays: number;
  totalRequiredHours: number;
  averageDailyHours: number;
}
```

**Example:**
```json
{
  "startDate": "2026-01-01",
  "endDate": "2026-01-07",
  "days": [
    { "date": "2026-01-01", "dayOfWeek": "Thursday", "requiredHours": 0, "isWorkingDay": false },
    { "date": "2026-01-02", "dayOfWeek": "Friday", "requiredHours": 8, "isWorkingDay": true },
    { "date": "2026-01-03", "dayOfWeek": "Saturday", "requiredHours": 0, "isWorkingDay": false },
    { "date": "2026-01-04", "dayOfWeek": "Sunday", "requiredHours": 0, "isWorkingDay": false },
    { "date": "2026-01-05", "dayOfWeek": "Monday", "requiredHours": 8, "isWorkingDay": true },
    { "date": "2026-01-06", "dayOfWeek": "Tuesday", "requiredHours": 8, "isWorkingDay": true },
    { "date": "2026-01-07", "dayOfWeek": "Wednesday", "requiredHours": 8, "isWorkingDay": true }
  ],
  "summary": {
    "totalDays": 7,
    "workingDays": 4,
    "nonWorkingDays": 3,
    "totalRequiredHours": 32,
    "averageDailyHours": 8
  }
}
```

### `get_worklogs` Response

```typescript
interface GetWorklogsResponse {
  startDate: string;
  endDate: string;
  issueFilter?: string;        // If filtered by issue
  worklogs: Worklog[];
  byIssue: IssueAggregate[];
  summary: WorklogSummary;
}

interface Worklog {
  id: string;
  issueKey: string;
  issueSummary: string;
  date: string;                // "2026-01-02"
  hours: number;               // 8
  comment: string;
}

interface IssueAggregate {
  issueKey: string;
  issueSummary: string;
  totalHours: number;
  entryCount: number;
}

interface WorklogSummary {
  totalHours: number;
  totalEntries: number;
  uniqueIssues: number;
}
```

**Example:**
```json
{
  "startDate": "2026-01-01",
  "endDate": "2026-01-07",
  "worklogs": [
    { "id": "1292228", "issueKey": "PROJ-123", "issueSummary": "Implement user authentication", "date": "2026-01-02", "hours": 8, "comment": "Working on login flow" },
    { "id": "1292170", "issueKey": "PROJ-123", "issueSummary": "Implement user authentication", "date": "2026-01-05", "hours": 8, "comment": "Added OAuth support" },
    { "id": "1292171", "issueKey": "PROJ-123", "issueSummary": "Implement user authentication", "date": "2026-01-06", "hours": 8, "comment": "Testing and fixes" },
    { "id": "1292226", "issueKey": "PROJ-123", "issueSummary": "Implement user authentication", "date": "2026-01-07", "hours": 8, "comment": "Documentation" }
  ],
  "byIssue": [
    { "issueKey": "PROJ-123", "issueSummary": "Implement user authentication", "totalHours": 32, "entryCount": 4 }
  ],
  "summary": {
    "totalHours": 32,
    "totalEntries": 4,
    "uniqueIssues": 1
  }
}
```

### `post_worklog` Response

```typescript
interface PostWorklogResponse {
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
```

### `bulk_post_worklogs` Response

```typescript
interface BulkPostWorklogsResponse {
  results: BulkWorklogResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    totalHours: number;
  };
}

interface BulkWorklogResult {
  date: string;
  issueKey: string;
  hours: number;
  success: boolean;
  worklogId?: string;          // Present if success
  error?: string;              // Present if failure
}
```

### `delete_worklog` Response

```typescript
interface DeleteWorklogResponse {
  success: true;
  deletedWorklogId: string;
}
```

## Implementation Tasks

### Phase 1: Type Definitions
- [ ] Create `src/types/responses.ts` with all response interfaces
- [ ] Export types from `src/types/index.ts`

### Phase 2: Update `get_schedule`
- [ ] Refactor to build `GetScheduleResponse` object
- [ ] Return `JSON.stringify(response)` in content
- [ ] Remove markdown formatting code
- [ ] Update tests

### Phase 3: Update `get_worklogs`
- [ ] Refactor to build `GetWorklogsResponse` object
- [ ] Add `byIssue` aggregation to response
- [ ] Return `JSON.stringify(response)` in content
- [ ] Remove markdown formatting code
- [ ] Update tests

### Phase 4: Update `post_worklog`
- [ ] Refactor to return `PostWorklogResponse`
- [ ] Remove markdown formatting
- [ ] Update tests

### Phase 5: Update `bulk_post_worklogs`
- [ ] Refactor to return `BulkPostWorklogsResponse`
- [ ] Include per-entry success/failure details
- [ ] Remove markdown formatting
- [ ] Update tests

### Phase 6: Update `delete_worklog`
- [ ] Refactor to return `DeleteWorklogResponse`
- [ ] Remove markdown formatting
- [ ] Update tests

### Phase 7: Documentation
- [ ] Update README with new response format
- [ ] Add examples of AI-formatted responses
- [ ] Update PROJECT_UNDERSTANDING.md

## Acceptance Criteria

### Core Functionality
- [ ] **AC1**: All tools return valid JSON in `content[0].text`
- [ ] **AC2**: JSON can be parsed with standard `JSON.parse()`
- [ ] **AC3**: All data from markdown responses is present in JSON
- [ ] **AC4**: Dates are in ISO 8601 format (`YYYY-MM-DD`)
- [ ] **AC5**: Hours are decimal numbers (not strings like "8h")

### `get_schedule`
- [ ] **AC6**: Response includes `days` array with all days in range
- [ ] **AC7**: Each day has `date`, `dayOfWeek`, `requiredHours`, `isWorkingDay`
- [ ] **AC8**: Response includes `summary` with totals

### `get_worklogs`
- [ ] **AC9**: Response includes `worklogs` array with all entries
- [ ] **AC10**: Each worklog has `id`, `issueKey`, `issueSummary`, `date`, `hours`, `comment`
- [ ] **AC11**: Response includes `byIssue` aggregation
- [ ] **AC12**: Response includes `summary` with totals

### `post_worklog`
- [ ] **AC13**: Response includes created worklog details
- [ ] **AC14**: Response includes `success: true`

### `bulk_post_worklogs`
- [ ] **AC15**: Response includes per-entry `results` array
- [ ] **AC16**: Each result indicates `success` boolean
- [ ] **AC17**: Failed entries include `error` message
- [ ] **AC18**: Response includes `summary` with counts

### `delete_worklog`
- [ ] **AC19**: Response includes `deletedWorklogId`
- [ ] **AC20**: Response includes `success: true`

### Compatibility
- [ ] **AC21**: Tool input schemas unchanged
- [ ] **AC22**: Error responses remain as text messages
- [ ] **AC23**: NPX distribution works with new responses

## Usage Examples

### CLI Interaction (AI Formats JSON)

```
User: "What's my schedule for this week?"

AI: [Calls get_schedule, receives JSON]

AI Response to User:
"Here's your schedule for January 1-7, 2026:

You have 4 working days (32 hours required):
- Thu Jan 1: Holiday (non-working)
- Fri Jan 2: 8h
- Sat-Sun: Weekend
- Mon-Wed Jan 5-7: 8h each

Total: 32 hours across 4 working days."
```

### Programmatic Consumption

```typescript
// Any consumer can parse the JSON response
const data = JSON.parse(result.content[0].text);

// data.days array is ready for processing
console.log(data.days);

// data.summary has the aggregated stats
console.log(data.summary);
```

## Out of Scope

- Changes to tool input schemas
- Changes to tool names or descriptions
- Adding new tools
- Removing any existing data from responses
- Pretty-printing JSON (use compact format)

## Migration Notes

This is a **breaking change** for any consumers expecting markdown responses. However:
- TempoFiller is not yet widely deployed
- AI hosts will adapt automatically (they interpret responses)
- Programmatic consumers benefit from structured data

## Success Criteria

| Metric | Target |
|--------|--------|
| Response parseability | 100% valid JSON |
| Data completeness | All markdown data present in JSON |
| Response size | ≤ 120% of current markdown size |
| Tool contract stability | Input schemas unchanged |

## References

- [MCP SDK Types](https://github.com/modelcontextprotocol/sdk)
- [Existing get-schedule spec](./get-schedule.md)
