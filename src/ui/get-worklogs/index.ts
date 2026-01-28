import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";

// Types matching the response
interface ScheduleDayResponse {
  date: string;
  dayOfWeek: string;
  requiredHours: number;
  isWorkingDay: boolean;
}

interface WorklogResponse {
  id: string;
  issueKey: string;
  issueSummary: string;
  date: string;
  hours: number;
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

interface GetWorklogsJsonResponse {
  startDate: string;
  endDate: string;
  issueFilter?: string;
  worklogs: WorklogResponse[];
  byIssue: IssueAggregateResponse[];
  summary: WorklogSummaryResponse;
  schedule: ScheduleDayResponse[];
}

type ZoomLevel = "days" | "weeks" | "months";

// Current data storage
let currentData: GetWorklogsJsonResponse | null = null;

// Determine optimal zoom level based on date range
function getOptimalZoomLevel(startDate: string, endDate: string): ZoomLevel {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  // Calculate difference in months (0 = same month, 1 = adjacent months, etc.)
  const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 +
                     (end.getMonth() - start.getMonth());

  if (monthsDiff === 0) {
    // Same month: days view
    return "days";
  } else if (monthsDiff <= 2) {
    // 2-3 months (adjacent to 3 months apart): weeks view
    return "weeks";
  } else {
    // Beyond 3 months: months view
    return "months";
  }
}

// Get ISO week key (YYYY-Www)
function getISOWeekKey(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  // Get Thursday of the week to determine week number
  const thursday = new Date(date);
  thursday.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  firstThursday.setDate(
    firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3
  );
  const weekNum =
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604800000);
  const year = thursday.getFullYear();
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

// Get period key based on zoom level
function getPeriodKey(dateStr: string, zoomLevel: ZoomLevel): string {
  switch (zoomLevel) {
    case "days":
      return dateStr;
    case "weeks":
      return getISOWeekKey(dateStr);
    case "months":
      return dateStr.substring(0, 7); // YYYY-MM
    default:
      return dateStr;
  }
}

// Get display header for period
function getPeriodHeader(
  periodKey: string,
  zoomLevel: ZoomLevel,
  showMonth: boolean = false
): { top?: string; main: string; sub?: string } {
  switch (zoomLevel) {
    case "days": {
      const date = new Date(periodKey + "T00:00:00");
      const day = String(date.getDate()).padStart(2, "0");
      const weekday = date.toLocaleDateString(navigator.language, {
        weekday: "short",
      });
      if (showMonth) {
        const month = date.toLocaleDateString(navigator.language, {
          month: "short",
        });
        // Three-line format: month / day / weekday
        return { top: month, main: day, sub: weekday };
      }
      // Two-line format: day / weekday
      return { main: day, sub: weekday };
    }
    case "weeks": {
      const [year, weekPart] = periodKey.split("-");
      const weekNum = parseInt(weekPart.substring(1), 10);
      // Calculate the Monday of the ISO week
      const jan4 = new Date(parseInt(year, 10), 0, 4);
      const dayOfWeek = jan4.getDay() || 7; // Convert Sunday from 0 to 7
      const monday = new Date(jan4);
      monday.setDate(jan4.getDate() - dayOfWeek + 1 + (weekNum - 1) * 7);
      if (showMonth) {
        const month = monday.toLocaleDateString(navigator.language, {
          month: "short",
        });
        // Three-line format: month / week / (empty)
        return { top: month, main: weekPart };
      }
      // Just show week number
      return { main: weekPart };
    }
    case "months": {
      const [, month] = periodKey.split("-");
      const date = new Date(2000, parseInt(month, 10) - 1, 1);
      return {
        main: date.toLocaleDateString(navigator.language, { month: "short" }),
      };
    }
    default:
      return { main: periodKey };
  }
}

// Aggregate schedule by period
function aggregateScheduleByPeriod(
  schedule: ScheduleDayResponse[],
  zoomLevel: ZoomLevel
): Map<string, { required: number; isWorking: boolean }> {
  const result = new Map<string, { required: number; isWorking: boolean }>();

  for (const day of schedule) {
    const key = getPeriodKey(day.date, zoomLevel);
    const existing = result.get(key);
    if (existing) {
      existing.required += day.requiredHours;
      existing.isWorking = existing.isWorking || day.isWorkingDay;
    } else {
      result.set(key, {
        required: day.requiredHours,
        isWorking: day.isWorkingDay,
      });
    }
  }

  return result;
}

// Build pivot table data
function buildPivotTable(
  worklogs: WorklogResponse[],
  issues: IssueAggregateResponse[],
  zoomLevel: ZoomLevel
): {
  periods: string[];
  issueRows: Map<string, Map<string, number>>;
} {
  const periods = new Set<string>();
  const issueRows = new Map<string, Map<string, number>>();

  // Initialize issue rows
  for (const issue of issues) {
    issueRows.set(issue.issueKey, new Map());
  }

  // Populate cells
  for (const worklog of worklogs) {
    const periodKey = getPeriodKey(worklog.date, zoomLevel);
    periods.add(periodKey);

    const issueRow = issueRows.get(worklog.issueKey);
    if (issueRow) {
      const existing = issueRow.get(periodKey) || 0;
      issueRow.set(periodKey, existing + worklog.hours);
    }
  }

  // Sort periods
  const sortedPeriods = Array.from(periods).sort();

  return { periods: sortedPeriods, issueRows };
}

// Get CSS class for coverage state
function getCoverageClass(logged: number, required: number): string {
  if (required === 0 && logged === 0) return "coverage-non-working";
  if (logged === 0 && required > 0) return "coverage-gap";
  if (logged > 0 && logged < required) return "coverage-under";
  if (logged === required) return "coverage-full";
  if (logged > required) return "coverage-over";
  return "";
}

// Truncate summary text
function truncateSummary(text: string, maxLen: number = 30): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + "...";
}

// Format date range for display
function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  return `${start.toLocaleDateString(navigator.language, opts)} - ${end.toLocaleDateString(navigator.language, opts)}`;
}

// Round to 1 decimal for display
function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
}

// Render the grid
function renderGrid(data: GetWorklogsJsonResponse, zoomLevel: ZoomLevel): void {
  const container = document.getElementById("grid-container");
  const emptyState = document.getElementById("empty-state");
  const dateRange = document.getElementById("date-range");

  if (!container || !emptyState || !dateRange) return;

  // Update date range display
  dateRange.textContent = formatDateRange(data.startDate, data.endDate);

  // Check for empty state
  if (data.worklogs.length === 0) {
    container.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  const { periods, issueRows } = buildPivotTable(
    data.worklogs,
    data.byIssue,
    zoomLevel
  );
  const scheduleByPeriod = aggregateScheduleByPeriod(data.schedule, zoomLevel);

  // Calculate period totals first (needed for header coverage colors)
  const periodTotals = new Map<string, number>();
  for (const worklog of data.worklogs) {
    const periodKey = getPeriodKey(worklog.date, zoomLevel);
    const existing = periodTotals.get(periodKey) || 0;
    periodTotals.set(periodKey, existing + worklog.hours);
  }

  // Calculate total required hours from schedule
  const totalRequired = data.schedule
    .filter((d) => d.isWorkingDay)
    .reduce((sum, d) => sum + d.requiredHours, 0);

  // Detect if data spans multiple months (for showing month in headers)
  const startMonth = data.startDate.substring(0, 7); // YYYY-MM
  const endMonth = data.endDate.substring(0, 7);
  const spansMultipleMonths = startMonth !== endMonth;

  // Create scroll container
  const scrollContainer = document.createElement("div");
  scrollContainer.className = "scroll-container";

  // Create table
  const table = document.createElement("table");

  // Header row
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  // Issue column header
  const issueHeader = document.createElement("th");
  issueHeader.className = "sticky-issue";
  issueHeader.textContent = "Issue";
  headerRow.appendChild(issueHeader);

  // Logged column header with coverage color
  const loggedHeader = document.createElement("th");
  loggedHeader.className = "sticky-logged";
  loggedHeader.textContent = "Logged";
  const totalLoggedCoverageClass = getCoverageClass(data.summary.totalHours, totalRequired);
  if (totalLoggedCoverageClass) {
    loggedHeader.classList.add(totalLoggedCoverageClass);
  }
  headerRow.appendChild(loggedHeader);

  // Period column headers with coverage colors
  for (const period of periods) {
    const th = document.createElement("th");
    const schedInfo = scheduleByPeriod.get(period);
    const logged = periodTotals.get(period) || 0;
    const required = schedInfo?.required || 0;

    // Apply coverage class to header
    const coverageClass = getCoverageClass(logged, required);
    if (coverageClass) {
      th.classList.add(coverageClass);
    }

    const header = getPeriodHeader(period, zoomLevel, spansMultipleMonths);
    if (header.top) {
      // Three-line format: month / day / weekday
      th.innerHTML = `<div class="day-header"><span class="day-month">${header.top}</span><span class="day-num">${header.main}</span>${header.sub ? `<span class="day-name">${header.sub}</span>` : ""}</div>`;
    } else if (header.sub) {
      // Two-line format: day / weekday
      th.innerHTML = `<div class="day-header"><span class="day-num">${header.main}</span><span class="day-name">${header.sub}</span></div>`;
    } else {
      th.textContent = header.main;
    }
    headerRow.appendChild(th);
  }

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body rows
  const tbody = document.createElement("tbody");

  for (const issue of data.byIssue) {
    const row = document.createElement("tr");
    const issueCell = document.createElement("td");
    issueCell.className = "sticky-issue";
    issueCell.innerHTML = `<div class="issue-cell"><span class="issue-summary">${truncateSummary(issue.issueSummary)}</span><span class="issue-key">${issue.issueKey}</span></div>`;
    row.appendChild(issueCell);

    // Logged total for this issue
    const loggedCell = document.createElement("td");
    loggedCell.className = "sticky-logged";
    loggedCell.textContent = formatHours(issue.totalHours);
    row.appendChild(loggedCell);

    // Period cells
    const issueData = issueRows.get(issue.issueKey);
    for (const period of periods) {
      const td = document.createElement("td");
      const schedInfo = scheduleByPeriod.get(period);
      if (schedInfo && !schedInfo.isWorking) {
        td.className = "non-working-col";
      }

      const hours = issueData?.get(period) || 0;
      if (hours > 0) {
        td.textContent = formatHours(hours);
      }
      row.appendChild(td);
    }

    tbody.appendChild(row);
  }

  // Total row
  const totalRow = document.createElement("tr");
  totalRow.className = "total-row";

  const totalLabelCell = document.createElement("td");
  totalLabelCell.className = "sticky-issue";
  totalLabelCell.textContent = "Total";
  totalRow.appendChild(totalLabelCell);

  const totalLoggedCell = document.createElement("td");
  totalLoggedCell.className = "sticky-logged";
  totalLoggedCell.textContent = `${formatHours(data.summary.totalHours)}/${formatHours(totalRequired)}`;

  // Apply coverage class to total logged cell
  if (totalLoggedCoverageClass) {
    totalLoggedCell.classList.add(totalLoggedCoverageClass);
  }
  totalRow.appendChild(totalLoggedCell);

  // Period totals with coverage coloring
  for (const period of periods) {
    const td = document.createElement("td");
    const logged = periodTotals.get(period) || 0;
    const schedInfo = scheduleByPeriod.get(period);
    const required = schedInfo?.required || 0;

    // Format as logged/required
    td.textContent = `${formatHours(logged)}/${formatHours(required)}`;

    // Apply coverage class
    const coverageClass = getCoverageClass(logged, required);
    if (coverageClass) {
      td.classList.add(coverageClass);
    }

    totalRow.appendChild(td);
  }

  tbody.appendChild(totalRow);
  table.appendChild(tbody);
  scrollContainer.appendChild(table);

  // Footer with record count
  const footer = document.createElement("div");
  footer.className = "grid-footer";
  footer.textContent = `Found ${data.worklogs.length} worklog${data.worklogs.length === 1 ? "" : "s"} across ${data.summary.uniqueIssues} issue${data.summary.uniqueIssues === 1 ? "" : "s"}`;

  container.innerHTML = "";
  container.appendChild(scrollContainer);
  container.appendChild(footer);
}

// Handle host context changes (theme, styles, safe areas)
function handleHostContextChanged(ctx: McpUiHostContext): void {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
  }
  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
  if (ctx.styles?.css?.fonts) {
    applyHostFonts(ctx.styles.css.fonts);
  }
  if (ctx.safeAreaInsets) {
    const app = document.getElementById("app");
    if (app) {
      app.style.paddingTop = `${ctx.safeAreaInsets.top}px`;
      app.style.paddingRight = `${ctx.safeAreaInsets.right}px`;
      app.style.paddingBottom = `${ctx.safeAreaInsets.bottom}px`;
      app.style.paddingLeft = `${ctx.safeAreaInsets.left}px`;
    }
  }
}

// 1. Create app instance
const app = new App({ name: "Worklogs Timesheet", version: "1.0.0" });

// 2. Register handlers BEFORE connecting
app.onteardown = async () => {
  console.info("App is being torn down");
  return {};
};

app.ontoolinput = (params) => {
  console.info("Received tool call input:", params);
};

app.ontoolresult = (result) => {
  console.info("Received tool call result:", result);
  try {
    // Prefer structuredContent if available, otherwise parse text content
    let data: GetWorklogsJsonResponse | null = null;

    const typedResult = result as { structuredContent?: unknown; content?: Array<{ type: string; text?: string }> };
    if (typedResult.structuredContent) {
      data = typedResult.structuredContent as GetWorklogsJsonResponse;
    } else if (typedResult.content && typedResult.content.length > 0 && typedResult.content[0].type === "text" && typedResult.content[0].text) {
      data = JSON.parse(typedResult.content[0].text) as GetWorklogsJsonResponse;
    }

    if (data) {
      currentData = data;
      const zoomToggle = document.getElementById("zoom-toggle") as HTMLSelectElement;

      // Determine optimal zoom level based on date range
      const optimalZoom = getOptimalZoomLevel(data.startDate, data.endDate);

      // Set the dropdown to the optimal value
      if (zoomToggle) {
        zoomToggle.value = optimalZoom;
      }

      renderGrid(currentData, optimalZoom);
    }
  } catch (error) {
    console.error("Failed to render grid:", error);
    const container = document.getElementById("grid-container");
    if (container) {
      container.innerHTML = `<div style="color: var(--color-text-danger, #d32f2f); padding: 16px;">Failed to load worklog data</div>`;
    }
  }
};

app.onerror = console.error;

app.onhostcontextchanged = handleHostContextChanged;

// Zoom toggle event listener
document.addEventListener("DOMContentLoaded", () => {
  const zoomToggle = document.getElementById(
    "zoom-toggle"
  ) as HTMLSelectElement;
  if (zoomToggle) {
    zoomToggle.addEventListener("change", () => {
      if (currentData) {
        renderGrid(currentData, zoomToggle.value as ZoomLevel);
      }
    });
  }
});

// 3. Connect to host
app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) {
    handleHostContextChanged(ctx);
  }
});
