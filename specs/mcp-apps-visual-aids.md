# Product Specification: MCP Apps Visual Aids

## Purpose & Scope

### Overview
This spec adds visual UI components to TempoFiller's `get_schedule` and `get_worklogs` tools using the MCP Apps extension (SEP-1865). These visualizations render directly in AI chat interfaces (Claude Desktop, VS Code, ChatGPT). CLI hosts receive the same JSON, which the AI formats conversationally for users.

### Target Users
- **Primary**: AI assistants rendering UI for users in supported hosts
- **End Users**: Knowledge workers who need visual feedback when managing Tempo worklogs
- **Use Cases**: Schedule visualization, worklog review, time distribution analysis

### Intended Outcomes
- Provide at-a-glance schedule and worklog visualization
- Reduce cognitive load when reviewing time entries
- Maintain full backwards compatibility with CLI hosts (Claude Code, etc.)
- Establish foundation for future interactive UI features

### Design Philosophy
**Visual aids, not UI replacement.** This spec adds visualization to existing tools—it does not recreate Tempo's full timesheet interface. Each tool gets a focused visual that enhances its specific data.

## Tool 1: `get_schedule` → Calendar View

### Purpose
Visualize working days vs non-working days for a queried period.

### Data Available (from JSON response)
Types defined in `src/types/responses.ts`:

```typescript
interface GetScheduleJsonResponse {
  startDate: string;           // "2026-01-01"
  endDate: string;             // "2026-01-31"
  days: ScheduleDayResponse[];
  summary: ScheduleSummaryResponse;
}

interface ScheduleDayResponse {
  date: string;                // "2026-01-01" (ISO 8601)
  dayOfWeek: string;           // "Monday"
  requiredHours: number;       // 8 or 0
  isWorkingDay: boolean;
}

interface ScheduleSummaryResponse {
  totalDays: number;
  workingDays: number;
  nonWorkingDays: number;
  totalRequiredHours: number;
  averageDailyHours: number;
}
```

### Visual Design
A simple month calendar grid with color-coded days:

```
┌────────────────────────────────────────┐
│  October 2025          184h required   │
├────────────────────────────────────────┤
│  Mo   Tu   We   Th   Fr   Sa   Su      │
│             1    2    3    4    5      │
│            ■    ■    ■    □    □       │
│                                        │
│   6    7    8    9   10   11   12      │
│   ■    ■    ■    ■    ■    □    □      │
│                                        │
│  13   14   15   16   17   18   19      │
│   ■    ■    ■    ■    ■    □    □      │
│                                        │
│  20   21   22   23   24   25   26      │
│   ■    ■    ■    ■    ■    □    □      │
│                                        │
│  27   28   29   30   31                │
│   ■    ■    ■    ■    ■                │
│                                        │
├────────────────────────────────────────┤
│  ■ Working (23 days)                   │
│  □ Non-working (8 days)                │
└────────────────────────────────────────┘
```

### Color Coding
| State | Visual | CSS |
|-------|--------|-----|
| Working day | Blue/filled cell | `background: #e3f2fd` |
| Non-working day | Gray/dimmed cell | `background: #f5f5f5` |
| Today (if in range) | Border highlight | `border: 2px solid #1976d2` |

### Behavior
- **Read-only**: No click interactions
- **Responsive**: Adapts to panel width
- **Multi-month**: If query spans multiple months, show each month as separate grid
- **Locale-aware**: First day of week depends on user's locale (Monday in most locales, Sunday in US)
- **Today highlight**: Always shown if today is within query range, regardless of working/non-working status

---

## Tool 2: `get_worklogs` → Timesheet Grid View

### Purpose
Visualize logged hours in a Tempo-style pivot table (issues × days).

### Data Available (from JSON response)
Types defined in `src/types/responses.ts`:

```typescript
interface GetWorklogsJsonResponse {
  startDate: string;
  endDate: string;
  issueFilter?: string;        // If filtered by issue
  worklogs: WorklogResponse[];
  byIssue: IssueAggregateResponse[];
  summary: WorklogSummaryResponse;
  schedule: ScheduleDayResponse[];  // For coverage-aware coloring
}

interface WorklogResponse {
  id: string;
  issueKey: string;
  issueSummary: string;
  date: string;                // "2026-01-02" (ISO 8601)
  hours: number;               // decimal
  comment: string;
}

interface IssueAggregateResponse {
  issueKey: string;
  issueSummary: string;
  totalHours: number;
  entryCount: number;
}

interface WorklogSummaryResponse {
  totalHours: number;
  totalEntries: number;
  uniqueIssues: number;
}
```

### Visual Design
Follows Tempo's native grid UX - a pivot table with issues as rows and time periods as columns:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Jan 1 - Jan 31, 2026                              [Days ▼] zoom toggle  │
├─────────────────────────────────┬────────┬────┬────┬────┬────┬────┬────┬─┤
│ Issue                           │ Logged │ 01 │ 02 │ 03 │ 04 │ 05 │ 06 │…│
│                                 │        │ We │ Th │ Fr │ Sa │ Su │ Mo │ │
├─────────────────────────────────┼────────┼────┼────┼────┼────┼────┼────┼─┤
│ Administrative                  │      6 │    │    │    │    │    │    │ │
│ ENG-100                         │        │    │    │    │ ▓▓ │ ▓▓ │    │ │
│ Feature Development for New...  │    120 │  8 │  8 │  8 │    │    │  8 │…│
│ ENG-456                         │        │    │    │    │ ▓▓ │ ▓▓ │    │ │
├─────────────────────────────────┼────────┼────┼────┼────┼────┼────┼────┼─┤
│ Total                           │    126 │  8 │  8 │  8 │  0 │  0 │  8 │…│
└─────────────────────────────────┴────────┴────┴────┴────┴────┴────┴────┴─┘
                                                 ▲▲▲▲▲▲▲▲▲
                                                 Non-working columns = subtle gray bg (▓▓)
```

**Issue Cell Format:** Two lines per issue row:
- Line 1: Issue summary (truncated at ~30 characters with `...`)
- Line 2: Issue key (smaller/muted text)

**Column Backgrounds:** Non-working day columns have a subtle gray background (`#fafafa`) throughout the entire column, not just in the total row.

**Empty Cells:** Cells with no logged hours are left blank (not "0" or "-").

### Zoom Levels (Client-Side Toggle)
The user can switch between aggregation levels without re-querying:

| Level | Columns | Example Headers | Best For |
|-------|---------|-----------------|----------|
| **Days** (default) | Each day | `01 We`, `02 Th`, `03 Fr` | Week/bi-weekly queries |
| **Weeks** | Each ISO week | `W1 (Jan 1-7)`, `W2 (Jan 8-14)` | Monthly queries |
| **Months** | Each month | `Jan`, `Feb`, `Mar` | Quarterly/yearly queries |

**Week Numbering:** Uses ISO 8601 weeks (Monday start, week 1 contains January 4th).

### Data Transformation (Client-Side)
The UI receives the JSON response and transforms it into a pivot table:

```typescript
// Input: GetWorklogsJsonResponse.worklogs array
worklogs: [
  { issueKey: "ENG-456", date: "2026-01-01", hours: 8, ... },
  { issueKey: "ENG-456", date: "2026-01-02", hours: 8, ... },
  ...
]

// Transform to pivot table:
// rows = unique issueKeys (or use byIssue array)
// columns = dates (or weeks/months based on zoom)
// cells = sum of hours for that issue+period
```

### Color Coding (Coverage-Aware)

The `get_worklogs` tool will also fetch schedule data for the queried date range, enabling color-coded cells based on logged vs required hours.

**Total Row Format:** `logged/required` with color-coded background

| State | Condition | Color | CSS | Example |
|-------|-----------|-------|-----|---------|
| Full | `logged == required` | Green | `background: #e8f5e9` | `8/8` |
| Under | `0 < logged < required` | Yellow/orange | `background: #fff3e0` | `4/8` |
| Gap | `logged == 0 && required > 0` | Red | `background: #ffebee` | `0/8` |
| Over | `logged > required` | Blue | `background: #e3f2fd` | `10/8` or `4/0` |
| Non-working | `logged == 0 && required == 0` | Gray | `background: #f5f5f5` | `0/0` |

**Visual Example:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  Jan 1 - Jan 10, 2026                                    [Days ▼]       │
├─────────────────────────────┬────────┬─────┬─────┬─────┬─────┬─────┬────┤
│ Issue                       │ Logged │  01 │  02 │  03 │  04 │  05 │... │
│                             │        │  Th │  Fr │  Sa │  Su │  Mo │    │
├─────────────────────────────┼────────┼─────┼─────┼─────┼─────┼─────┼────┤
│ Feature Development for...  │     52 │   8 │   4 │  ▓▓ │  ▓▓ │     │    │
│ ENG-456                     │        │     │     │  ▓▓ │  ▓▓ │     │    │
│ API Integration and Test... │     24 │     │   4 │  ▓▓ │   4 │   8 │    │
│ ENG-789                     │        │     │     │  ▓▓ │     │     │    │
├─────────────────────────────┼────────┼─────┼─────┼─────┼─────┼─────┼────┤
│ Total                       │     76 │ 8/8 │ 8/8 │ 0/0 │ 4/0 │ 8/8 │    │
│                             │        │ grn │ grn │ gry │ blu │ grn │    │
└─────────────────────────────┴────────┴─────┴─────┴─────┴─────┴─────┴────┘

Legend: grn=green (full), gry=gray (non-working), blu=blue (over)
        ▓▓ = non-working column background
```

**Row Styling:**
| Element | CSS |
|---------|-----|
| Row hover | `background: rgba(0,0,0,0.04)` |
| Total row | `font-weight: bold` |
| Total cells | Color-coded background based on logged vs required |

### Data Requirements

To enable coverage-aware coloring, `get_worklogs` will:
1. Fetch worklogs for the date range (existing behavior)
2. **Also fetch schedule** for the same date range (new)
3. Pass both datasets to the UI for client-side color calculation

This adds one additional API call but enables significantly richer visualization.

### Behavior
- **Horizontal scroll**: Grid scrolls horizontally for many columns
- **Sticky columns**: Issue name and "Logged" total stay fixed while scrolling
- **Zoom toggle**: Dropdown or segmented control to switch Days/Weeks/Months
- **Read-only**: No click-to-edit (MVP)
- **No data state**: If no worklogs exist for the queried range, hide the grid and show a "No worklogs found for this period" message

---

## Response Format (Both Tools)

Tools return **structured JSON** (types in `src/types/responses.ts`):

```typescript
return {
  content: [
    { type: "text", text: JSON.stringify(structuredData) }
  ],
  // UI hosts render via _meta.ui.resourceUri on tool definition
};
```

**How different hosts handle this:**
- **UI hosts** (Claude Desktop, VS Code): Parse JSON, render visual UI
- **CLI hosts** (Claude Code): AI reads JSON, formats a conversational response for the user

This single-format approach avoids data duplication and keeps token usage efficient.

## Requirements & Constraints

### Functional Requirements

**`get_schedule` Calendar:**
- **FR1**: Display month calendar grid with correct day-of-week alignment
- **FR2**: Show working days vs non-working days with distinct colors
- **FR3**: Handle multi-month queries by showing multiple calendar grids
- **FR4**: Display period summary (working days count, total required hours)

**`get_worklogs` Timesheet Grid:**
- **FR5**: Display pivot table with issues as rows, time periods as columns
- **FR6**: Show hours logged per issue per day in cells
- **FR7**: Calculate and display row totals (per issue) and column totals (per day)
- **FR8**: Fetch schedule data alongside worklogs for coverage-aware coloring
- **FR9**: Display total row cells in `logged/required` format (e.g., "8/8")
- **FR10**: Color-code total row cells based on logged vs required hours:
  - Green: logged == required (full)
  - Yellow/orange: 0 < logged < required (under)
  - Red: logged == 0 && required > 0 (gap)
  - Blue: logged > required (over)
  - Gray: logged == 0 && required == 0 (non-working)
- **FR11**: Support zoom toggle: Days (default), Weeks, Months
- **FR12**: Aggregate data client-side based on selected zoom level
- **FR13**: Provide horizontal scrolling with sticky issue/total columns
- **FR14**: Apply subtle gray background to non-working day columns
- **FR15**: Display "No worklogs found" message when query returns zero worklogs
- **FR16**: Display issue as two lines: summary (~30 char truncation) and key (smaller text)

**Both Tools:**
- **FR17**: Render for any queried date range

### Non-Functional Requirements
- **NFR1**: UI renders within 500ms after tool result received
- **NFR2**: Works in Claude Desktop, VS Code, and ChatGPT
- **NFR3**: Graceful degradation to text-only for CLI hosts
- **NFR4**: Accessible color scheme with sufficient contrast between states
- **NFR5**: Responsive layout for different chat panel widths
- **NFR6**: Bundle size under 10KB per UI component (custom implementation)

### Technical Constraints
- **TC1**: Must use `@modelcontextprotocol/ext-apps` SDK for server integration
- **TC2**: UI must be single self-contained HTML file (vite-plugin-singlefile)
- **TC3**: Communication via postMessage only (no direct server connection)
- **TC4**: Must work within iframe sandbox restrictions
- **TC5**: Use existing TempoClient for data retrieval (no new API endpoints)
- **TC6**: TypeScript throughout, consistent with existing codebase

### Compatibility Constraints
- **CC1**: Tool input schemas must remain unchanged
- **CC2**: CLI hosts receive JSON; AI formats responses conversationally
- **CC3**: NPX distribution must continue to work
- **CC4**: Error responses remain as human-readable text messages

## Implementation Tasks

### Phase 1: Project Setup
- [ ] Add MCP Apps dependencies (`@modelcontextprotocol/ext-apps`, `vite`, `vite-plugin-singlefile`)
- [ ] Configure Vite build for UI bundle generation (two entry points)
- [ ] Update build scripts to include UI bundling step
- [ ] Create `src/ui/` directory structure

### Phase 2: `get-schedule` UI
- [ ] Create `src/ui/get-schedule/index.html` base template
- [ ] Create `src/ui/get-schedule/index.ts` with App class integration
- [ ] Implement month calendar grid rendering
- [ ] Add styling for working/non-working day states
- [ ] Handle multi-month queries (multiple grids)
- [ ] Display summary stats (working days, required hours)
- [ ] Add responsive layout handling

### Phase 3: `get-worklogs` UI
- [ ] Create `src/ui/get-worklogs/index.html` base template
- [ ] Create `src/ui/get-worklogs/index.ts` with App class integration
- [ ] Implement pivot table rendering (issues × days)
- [ ] Add data aggregation logic (group by issue + date)
- [ ] Implement zoom toggle (Days/Weeks/Months)
- [ ] Add client-side re-aggregation on zoom change
- [ ] Display total row cells as `logged/required` format
- [ ] Implement coverage-aware color coding (compare logged vs required)
- [ ] Implement sticky columns (issue name, logged total)
- [ ] Add horizontal scrolling for wide date ranges
- [ ] Calculate and display row totals (per issue)

### Phase 4: MCP Apps Integration
- [ ] Update `GetWorklogsJsonResponse` type to include `schedule: ScheduleDayResponse[]`
- [ ] Update `get_schedule` tool registration with `registerAppTool()` and UI metadata
- [ ] Update `get_worklogs` tool to also fetch schedule data for the queried range
- [ ] Update `get_worklogs` tool registration with `registerAppTool()` and UI metadata
- [ ] Register UI resources with `registerAppResource()` (two resources)
- [ ] Pass structured data (worklogs + schedule) to UI via tool result
- [ ] Implement `ontoolresult` handlers in both UIs
- [ ] Test postMessage communication flow
- [ ] Verify text fallback for CLI hosts (unchanged output)

### Phase 5: Testing & Polish
- [ ] Test `get-schedule` UI in Claude Desktop
- [ ] Test `get-worklogs` UI in Claude Desktop
- [ ] Test both UIs in VS Code with MCP support
- [ ] Verify CLI fallback in Claude Code (unchanged behavior)
- [ ] Test various date ranges (day, week, month, quarter)
- [ ] Test zoom toggle functionality in `get-worklogs` UI
- [ ] Verify bundle sizes (<10KB each)
- [ ] Cross-platform testing (Windows, macOS)

### Phase 6: Documentation
- [ ] Update README with MCP Apps feature section
- [ ] Add screenshots of both UIs
- [ ] Update PROJECT_UNDERSTANDING.md
- [ ] Document build process for UI bundles

## Acceptance Criteria

### `get_schedule` Calendar
- [ ] **AC1**: Calendar displays correct month grid with proper day-of-week alignment
- [ ] **AC2**: Working days visually distinct from non-working days (color-coded)
- [ ] **AC3**: Multi-month queries show multiple calendar grids
- [ ] **AC4**: Summary shows working day count and total required hours
- [ ] **AC5**: Today's date highlighted if within query range (even on non-working days)
- [ ] **AC6**: First day of week respects user's locale (Monday or Sunday)

### `get_worklogs` Timesheet Grid
- [ ] **AC7**: Grid displays issues as rows with two-line format (summary truncated ~30 chars, key smaller)
- [ ] **AC8**: Grid displays time periods as columns based on zoom level
- [ ] **AC9**: Cells show hours logged for that issue+period (blank if none)
- [ ] **AC10**: Row totals (per issue) calculated correctly in "Logged" column
- [ ] **AC11**: Total row cells show `logged/required` format (e.g., "8/8")
- [ ] **AC12**: Total row cells color-coded based on logged vs required:
  - Green for full (logged == required)
  - Yellow/orange for under (0 < logged < required)
  - Red for gap (logged == 0 && required > 0)
  - Blue for over (logged > required)
  - Gray for non-working (logged == 0 && required == 0)
- [ ] **AC13**: Non-working day columns have subtle gray background throughout
- [ ] **AC14**: Zoom toggle switches between Days/Weeks/Months views (ISO weeks)
- [ ] **AC15**: Data and colors re-aggregate correctly on zoom change
- [ ] **AC16**: Horizontal scroll works with sticky issue columns
- [ ] **AC17**: "No worklogs found" message shown when query returns zero worklogs

### Compatibility
- [ ] **AC18**: Claude Desktop renders both UIs inline
- [ ] **AC19**: VS Code renders both UIs inline
- [ ] **AC20**: Claude Code receives JSON, AI formats it conversationally
- [ ] **AC21**: NPX installation works with UI bundled
- [ ] **AC22**: Tool input schemas unchanged

### User Experience
- [ ] **AC23**: UIs load within 500ms of tool result
- [ ] **AC24**: Color scheme uses distinct, accessible colors (sufficient contrast)

### Technical Quality
- [ ] **AC25**: Each UI bundle under 10KB
- [ ] **AC26**: No console errors in UI hosts
- [ ] **AC27**: TypeScript strict mode passes
- [ ] **AC28**: Build process succeeds on Windows and Unix

## Usage Examples

### `get_schedule` - View Work Schedule
```
User: "What's my schedule for January 2026?"

AI Assistant: [Calls get_schedule tool]

UI Host (Claude Desktop/VS Code):
┌────────────────────────────────────────┐
│  January 2026          184h required   │
├────────────────────────────────────────┤
│  Mo   Tu   We   Th   Fr   Sa   Su      │
│             1    2    3    4    5      │
│            ■    ■    ■    □    □       │
│   6    7    8    9   10   11   12      │
│   ■    ■    ■    ■    ■    □    □      │
│  ... (full month grid)                 │
├────────────────────────────────────────┤
│  ■ Working (23 days)                   │
│  □ Non-working (8 days)                │
└────────────────────────────────────────┘

CLI Host (Claude Code):
AI receives JSON and formats conversationally:

"Your January 2026 schedule has 23 working days (184 hours required)
and 8 non-working days. Working days are Mon-Fri, with Jan 1st as
a holiday."
```

### `get_worklogs` - View Logged Time (Day View)
```
User: "Show my logged hours for January 2026"

AI Assistant: [Calls get_worklogs tool]

UI Host (Claude Desktop/VS Code):
┌────────────────────────────────────────────────────────────────────┐
│  Jan 1 - Jan 31, 2026                               [Days ▼]       │
├──────────────────────────────┬────────┬─────┬─────┬─────┬─────┬────┤
│ Issue                        │ Logged │  01 │  02 │  03 │  04 │... │
│                              │        │  We │  Th │  Fr │  Sa │    │
├──────────────────────────────┼────────┼─────┼─────┼─────┼─────┼────┤
│ Feature Development for...   │    120 │   8 │   8 │   8 │  ▓▓ │    │
│ ENG-456                      │        │     │     │     │  ▓▓ │    │
│ API Integration and Test...  │     56 │     │     │     │  ▓▓ │    │
│ ENG-789                      │        │     │     │     │  ▓▓ │    │
├──────────────────────────────┼────────┼─────┼─────┼─────┼─────┼────┤
│ Total                        │    176 │ 8/8 │ 8/8 │ 8/8 │ 0/0 │    │
└──────────────────────────────┴────────┴─────┴─────┴─────┴─────┴────┘
(Total row cells colored: green=full, gray=non-working)

CLI Host (Claude Code):
AI receives JSON and formats conversationally:

"You logged 176 hours in January across 22 entries:
- ENG-456 (Feature Development): 120h (15 entries)
- ENG-789 (API Integration): 56h (7 entries)"
```

### `get_worklogs` - Zoom to Month View
```
User: "Show my hours for all of 2025"

AI Assistant: [Calls get_worklogs tool]

UI Host: User clicks [Months ▼] zoom toggle

┌──────────────────────────────────────────────────────────────────────┐
│  Jan 1 - Dec 31, 2025                               [Months ▼]       │
├──────────────────────────────┬────────┬───────┬───────┬───────┬──────┤
│ Issue                        │ Logged │  Jan  │  Feb  │  Mar  │ ...  │
├──────────────────────────────┼────────┼───────┼───────┼───────┼──────┤
│ Feature Development for...   │    498 │    40 │    48 │    32 │      │
│ ENG-456                      │        │       │       │       │      │
│ API Integration and Test...  │    364 │    32 │    24 │    40 │      │
│ ENG-789                      │        │       │       │       │      │
│ Administrative               │      6 │       │     6 │       │      │
│ ENG-100                      │        │       │       │       │      │
│ PTO                          │    108 │     8 │       │    16 │      │
│ ENG-101                      │        │       │       │       │      │
├──────────────────────────────┼────────┼───────┼───────┼───────┼──────┤
│ Total                        │    976 │ 80/88 │ 78/80 │ 88/88 │      │
└──────────────────────────────┴────────┴───────┴───────┴───────┴──────┘
(Total row cells colored: yellow=under, green=full)
```

## Architecture

### File Structure
```
src/
├── ui/
│   ├── get-schedule/
│   │   ├── index.html        # HTML template
│   │   ├── index.ts          # MCP Apps client logic
│   │   └── styles.css        # Styles (inlined by Vite)
│   └── get-worklogs/
│       ├── index.html        # HTML template
│       ├── index.ts          # MCP Apps client logic + aggregation
│       └── styles.css        # Styles (inlined by Vite)
├── tools/
│   ├── get-schedule.ts       # Updated with UI metadata
│   ├── get-worklogs.ts       # Updated with UI metadata
│   └── ... other tools
└── index.ts                  # Updated with App registrations

dist/
├── index.js                  # Server bundle
└── ui/
    ├── get-schedule.html        # Self-contained UI bundle
    └── get-worklogs.html        # Self-contained UI bundle
```

### Data Flow

**`get_schedule` flow:**
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  AI Host    │────▶│ MCP Server  │────▶│ Tempo API   │
│  (Claude)   │     │ get_schedule│     │ /schedule   │
│             │◀────│             │◀────│             │
└─────────────┘     └─────────────┘     └─────────────┘
       │
       │ fetches ui://get-schedule.html
       ▼
┌─────────────────┐
│ get-schedule    │◀── Schedule days data via postMessage
│ UI (iframe)     │
└─────────────────┘
```

**`get_worklogs` flow:**
```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│  AI Host    │────▶│ MCP Server  │────▶│ Tempo APIs          │
│  (Claude)   │     │ get_worklogs│     │ /worklogs (primary) │
│             │◀────│             │◀────│ /schedule (for UI)  │
└─────────────┘     └─────────────┘     └─────────────────────┘
       │
       │ fetches ui://get-worklogs.html
       ▼
┌─────────────────┐
│ get-worklogs    │◀── Worklogs + Schedule data via postMessage
│ UI (iframe)     │──▶ Client-side aggregation + color coding
└─────────────────┘
```

## Implementation Guidelines

Both UIs are built with vanilla HTML, CSS, and TypeScript—no external UI libraries. This keeps bundle sizes minimal and gives full control over styling and behavior.

### Calendar (`get_schedule`)

**Approach:**
- Use CSS Grid (7-column layout) for the month view
- Prepend empty cells to align first day of month with correct weekday
- Render each month as a separate container for multi-month queries
- Detect user's locale to determine first day of week (Monday vs Sunday)

**Key patterns:**
- `position: sticky` not needed (no scrolling)
- Use `aspect-ratio: 1` for square day cells
- Highlight today with a border if within query range (even on non-working days)

### Timesheet Grid (`get_worklogs`)

**Approach:**
- Use HTML `<table>` for semantic structure
- Use CSS `position: sticky` for frozen columns (Issue, Logged)
- Horizontal scroll container for wide date ranges
- Client-side pivot transformation: worklogs array → issue×period matrix

**Key patterns:**
- Sticky columns require explicit `left` values and `background` to cover scrolled content
- Zoom toggle re-renders table without server round-trip (data already available)
- Coverage colors applied to total row cells based on logged vs required comparison

### Zoom Level Aggregation

When user changes zoom level, aggregate data client-side:

| Zoom | Period Key Format | Example |
|------|-------------------|---------|
| Days | `YYYY-MM-DD` | `2026-01-15` |
| Weeks | `YYYY-Www` (ISO 8601) | `2026-W03` |
| Months | `YYYY-MM` | `2026-01` |

**ISO Week Calculation:** Use `date-fns` `getISOWeek()` and `getISOWeekYear()` for consistent week numbering (Monday start, week 1 contains January 4th).

### Bundle Size Targets

| Component | Target |
|-----------|--------|
| `get-schedule` UI | < 5 KB |
| `get-worklogs` UI | < 8 KB |

---

## Out of Scope

### Not in MVP
- Click-to-fill interactions (clicking a cell to log time)
- Delete/edit actions from UI
- Filtering worklogs by issue within the grid
- Click-to-navigate between months
- Drill-down views (click day to see individual worklogs)
- Custom color theme support
- Export/print functionality
- Combined "coverage" view (schedule + worklogs overlaid)

### Deferred Features
- Interactive buttons calling `post_worklog` or `bulk_post_worklogs`
- Form inputs for quick time entry
- Real-time updates without re-calling tool
- Server-side callbacks from UI (uses `callServerTool()`)

## Future Considerations

### Phase 2 Enhancements
1. **Coverage View**: Overlay schedule + worklogs to highlight gaps
2. **Click-to-Fill**: Click empty cell → triggers `post_worklog`
3. **Issue Pie Chart**: Add donut chart showing hours distribution by issue

### Phase 3 Enhancements
1. **Month Navigation**: Arrow buttons to query adjacent periods
2. **Cell Detail Popover**: Click cell to see individual worklog entries
3. **Bulk Actions**: "Fill all gaps with [issue]" button
4. **Delete from Grid**: Click worklog to delete it

### Long-Term Vision
These visual aids establish a foundation for TempoFiller to evolve from text-only tool responses to a hybrid experience where visual UI enhances (but doesn't replace) the conversational interface. The familiar Tempo grid UX reduces learning curve while AI handles the complex operations.

## Dependencies

### New Dependencies
```json
{
  "dependencies": {
    "@modelcontextprotocol/ext-apps": "^1.0.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "vite-plugin-singlefile": "^2.0.0"
  }
}
```

**No UI libraries required.** Both calendar and grid are implemented with vanilla HTML, CSS, and TypeScript. This keeps the bundle minimal and avoids third-party dependency management.

### Existing Dependencies (Unchanged)
- `@modelcontextprotocol/sdk` ^1.17.1
- `axios`, `date-fns`, `zod`

## Success Criteria

| Metric | Target |
|--------|--------|
| Schedule comprehension | User understands working/non-working at a glance |
| Worklog comprehension | User sees time distribution without reading text |
| Bundle size | < 10KB per UI component |
| UI host compatibility | Works in Claude Desktop + VS Code |
| CLI host compatibility | AI formats JSON into helpful responses |
| Build time | < 30 seconds additional for UI bundles |
| Zoom responsiveness | < 100ms to re-aggregate on zoom change |

## References

- [MCP Apps Announcement](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
- [ext-apps Repository](https://github.com/modelcontextprotocol/ext-apps)
- [MCP Apps Quickstart](https://modelcontextprotocol.github.io/ext-apps/api/documents/Quickstart.html)
- [SEP-1865 Specification](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1865)
- [TempoFiller MCP Server](https://github.com/jfuchs/tempo-filler-mcp-server)
- [Existing get-schedule spec](./get-schedule.md)
