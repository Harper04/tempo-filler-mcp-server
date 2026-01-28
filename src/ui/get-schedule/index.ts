import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";

// Types matching GetScheduleJsonResponse
interface ScheduleDayResponse {
  date: string;
  dayOfWeek: string;
  requiredHours: number;
  isWorkingDay: boolean;
}

interface ScheduleSummaryResponse {
  totalDays: number;
  workingDays: number;
  nonWorkingDays: number;
  totalRequiredHours: number;
  averageDailyHours: number;
}

interface GetScheduleJsonResponse {
  startDate: string;
  endDate: string;
  days: ScheduleDayResponse[];
  summary: ScheduleSummaryResponse;
}

interface MonthGroup {
  year: number;
  month: number;
  days: ScheduleDayResponse[];
  requiredHours: number;
}

// Get locale-aware first day of week (0 = Sunday, 1 = Monday)
function getLocaleFirstDayOfWeek(): number {
  try {
    const locale = new Intl.Locale(navigator.language);
    // weekInfo is available in modern browsers
    const weekInfo = (locale as any).weekInfo;
    if (weekInfo && typeof weekInfo.firstDay === "number") {
      // weekInfo.firstDay: 1=Monday, 7=Sunday
      return weekInfo.firstDay === 7 ? 0 : weekInfo.firstDay;
    }
  } catch {
    // Fallback
  }
  // Default to Monday for most locales
  return 1;
}

// Get day of week names starting from locale's first day
function getWeekdayNames(firstDay: number): string[] {
  const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const reordered: string[] = [];
  for (let i = 0; i < 7; i++) {
    reordered.push(days[(firstDay + i) % 7]);
  }
  return reordered;
}

// Get month name
function getMonthName(month: number): string {
  const date = new Date(2000, month, 1);
  return date.toLocaleDateString(navigator.language, { month: "long" });
}

// Check if a date string is today
function isToday(dateString: string): boolean {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  return dateString === todayStr;
}

// Group days by month
function groupDaysByMonth(days: ScheduleDayResponse[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();

  for (const day of days) {
    const [year, month] = day.date.split("-").map(Number);
    const key = `${year}-${month}`;

    if (!groups.has(key)) {
      groups.set(key, {
        year,
        month: month - 1, // 0-indexed for JS Date
        days: [],
        requiredHours: 0,
      });
    }

    const group = groups.get(key)!;
    group.days.push(day);
    group.requiredHours += day.requiredHours;
  }

  // Sort by date
  return Array.from(groups.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
}

// Render a single month grid
function renderMonthGrid(
  group: MonthGroup,
  firstDayOfWeek: number
): HTMLElement {
  const container = document.createElement("div");
  container.className = "month-container";

  // Header
  const header = document.createElement("div");
  header.className = "month-header";

  const title = document.createElement("span");
  title.className = "month-title";
  title.textContent = `${getMonthName(group.month)} ${group.year}`;

  const hours = document.createElement("span");
  hours.className = "month-hours";
  hours.textContent = `${group.requiredHours}h required`;

  header.appendChild(title);
  header.appendChild(hours);
  container.appendChild(header);

  // Weekday labels
  const weekdayHeader = document.createElement("div");
  weekdayHeader.className = "weekday-header";
  const weekdays = getWeekdayNames(firstDayOfWeek);
  for (const wd of weekdays) {
    const label = document.createElement("div");
    label.className = "weekday-label";
    label.textContent = wd;
    weekdayHeader.appendChild(label);
  }
  container.appendChild(weekdayHeader);

  // Calendar grid
  const grid = document.createElement("div");
  grid.className = "calendar-grid";

  // Find first day of month and calculate offset
  const firstDayOfMonth = new Date(group.year, group.month, 1);
  const firstDayWeekday = firstDayOfMonth.getDay(); // 0 = Sunday
  const offset = (firstDayWeekday - firstDayOfWeek + 7) % 7;

  // Create a map of dates for quick lookup
  const dayMap = new Map<number, ScheduleDayResponse>();
  for (const day of group.days) {
    const dayNum = parseInt(day.date.split("-")[2], 10);
    dayMap.set(dayNum, day);
  }

  // Get days in month
  const daysInMonth = new Date(group.year, group.month + 1, 0).getDate();

  // Add empty cells for offset
  for (let i = 0; i < offset; i++) {
    const cell = document.createElement("div");
    cell.className = "day-cell empty";
    grid.appendChild(cell);
  }

  // Add day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement("div");
    const dayData = dayMap.get(d);
    const dateStr = `${group.year}-${String(group.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    const classes = ["day-cell"];

    if (dayData) {
      classes.push(dayData.isWorkingDay ? "working" : "non-working");
    } else {
      // Day not in query range - show as non-working/inactive
      classes.push("non-working");
    }

    if (isToday(dateStr)) {
      classes.push("today");
    }

    cell.className = classes.join(" ");

    // Day number
    const dayNum = document.createElement("span");
    dayNum.className = "day-num";
    dayNum.textContent = String(d);
    cell.appendChild(dayNum);

    // Hours (only for working days with data)
    if (dayData && dayData.requiredHours > 0) {
      const hoursLabel = document.createElement("span");
      hoursLabel.className = "day-hours";
      hoursLabel.textContent = `${dayData.requiredHours}h`;
      cell.appendChild(hoursLabel);
    }

    grid.appendChild(cell);
  }

  container.appendChild(grid);
  return container;
}

// Render the full calendar
function renderCalendar(data: GetScheduleJsonResponse): void {
  const container = document.getElementById("calendar-container");
  if (!container) return;

  container.innerHTML = "";

  const firstDayOfWeek = getLocaleFirstDayOfWeek();
  const groups = groupDaysByMonth(data.days);

  for (const group of groups) {
    container.appendChild(renderMonthGrid(group, firstDayOfWeek));
  }

  // Legend
  const legend = document.createElement("div");
  legend.className = "legend";

  const workingItem = document.createElement("div");
  workingItem.className = "legend-item";
  workingItem.innerHTML = `<div class="legend-swatch working"></div><span>Working (${data.summary.workingDays} days)</span>`;

  const nonWorkingItem = document.createElement("div");
  nonWorkingItem.className = "legend-item";
  nonWorkingItem.innerHTML = `<div class="legend-swatch non-working"></div><span>Non-working (${data.summary.nonWorkingDays} days)</span>`;

  legend.appendChild(workingItem);
  legend.appendChild(nonWorkingItem);
  container.appendChild(legend);
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
const app = new App({ name: "Schedule Calendar", version: "1.0.0" });

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
    let data: GetScheduleJsonResponse | null = null;

    const typedResult = result as { structuredContent?: unknown; content?: Array<{ type: string; text?: string }> };
    if (typedResult.structuredContent) {
      data = typedResult.structuredContent as GetScheduleJsonResponse;
    } else if (typedResult.content && typedResult.content.length > 0 && typedResult.content[0].type === "text" && typedResult.content[0].text) {
      data = JSON.parse(typedResult.content[0].text) as GetScheduleJsonResponse;
    }

    if (data) {
      renderCalendar(data);
    }
  } catch (error) {
    console.error("Failed to render calendar:", error);
    const container = document.getElementById("calendar-container");
    if (container) {
      container.innerHTML = `<div style="color: var(--color-text-danger, #d32f2f);">Failed to load schedule data</div>`;
    }
  }
};

app.onerror = console.error;

app.onhostcontextchanged = handleHostContextChanged;

// 3. Connect to host
app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) {
    handleHostContextChanged(ctx);
  }
});
