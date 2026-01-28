# MCP Apps Development Guide

This document captures our learnings from implementing MCP Apps visual UIs for the TempoFiller MCP server.

## Overview

MCP Apps is an extension to the Model Context Protocol that allows MCP tools to return interactive HTML UIs that render directly in AI chat interfaces like Claude Desktop. Instead of just returning JSON/text, tools can display rich visualizations like timesheets, calendars, charts, etc.

## Core Concepts

### Tool + Resource Linking

Every MCP App requires two parts linked together:

1. **Tool** - Called by the LLM/host, returns data
2. **Resource** - Serves the bundled HTML UI that displays the data
3. **Link** - The tool's `_meta.ui.resourceUri` references the resource

```
Host calls tool → Server returns result → Host renders resource UI → UI receives result
```

### The `_meta` Structure

Tools must include `_meta.ui.resourceUri` to link to their UI resource:

```typescript
{
  name: "get_worklogs",
  description: "...",
  inputSchema: { ... },
  _meta: {
    ui: {
      resourceUri: "ui://tempofiller/get-worklogs.html"
    }
  }
}
```

**Important**: Use the nested structure `{ ui: { resourceUri } }`, not a flat key like `"ui/resourceUri"`.

### MIME Type

UI resources must use the MIME type `text/html;profile=mcp-app`:

```typescript
{
  uri: "ui://tempofiller/get-worklogs.html",
  name: "Worklogs Timesheet UI",
  mimeType: "text/html;profile=mcp-app"
}
```

### structuredContent

Tools should return both `content` (for text-based clients) and `structuredContent` (for UI parsing):

```typescript
return {
  content: [{ type: "text", text: JSON.stringify(response) }],
  structuredContent: response,
  isError: false
};
```

## HTTP Server Setup

### Stateless vs Stateful Mode

The MCP SDK's `StreamableHTTPServerTransport` supports two modes:

#### Stateful Mode (with sessions)
- Uses `sessionIdGenerator` to create session IDs
- Requires client to send `mcp-session-id` header on subsequent requests
- More complex, can have CORS issues with browsers

#### Stateless Mode (recommended for testing)
- Set `sessionIdGenerator: undefined`
- Creates a new server instance per request
- Simpler, works better with browser-based hosts like basic-host

```typescript
// Stateless mode - new server per request
app.all("/mcp", async (req, res) => {
  const server = createMCPServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode
  });

  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

### CORS Configuration

For browser-based testing, enable CORS:

```typescript
import cors from "cors";

const app = express();
app.use(cors()); // Wide open for testing
app.use(express.json());
```

## UI Development

### Project Structure

```
src/ui/
├── get-worklogs/
│   ├── index.html
│   ├── index.ts
│   └── styles.css
└── get-schedule/
    ├── index.html
    ├── index.ts
    └── styles.css
```

### HTML Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>My MCP App</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <div id="app">
    <!-- Your UI here -->
  </div>
  <script type="module" src="./index.ts"></script>
</body>
</html>
```

### TypeScript App Setup

Register all handlers BEFORE calling `app.connect()`:

```typescript
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
  type McpUiHostContext
} from "@modelcontextprotocol/ext-apps";

// Handle host context changes (theme, styles, safe areas)
function handleHostContextChanged(ctx: McpUiHostContext): void {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.safeAreaInsets) {
    const app = document.getElementById("app");
    if (app) {
      app.style.padding = `${ctx.safeAreaInsets.top}px ${ctx.safeAreaInsets.right}px ${ctx.safeAreaInsets.bottom}px ${ctx.safeAreaInsets.left}px`;
    }
  }
}

// 1. Create app instance
const app = new App({ name: "My App", version: "1.0.0" });

// 2. Register handlers BEFORE connecting
app.onteardown = async () => ({ });
app.ontoolinput = (params) => { /* handle input */ };
app.ontoolresult = (result) => { /* render UI with result data */ };
app.onerror = console.error;
app.onhostcontextchanged = handleHostContextChanged;

// 3. Connect to host
app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) handleHostContextChanged(ctx);
});
```

### Handling Tool Results

```typescript
app.ontoolresult = (result) => {
  // Prefer structuredContent if available
  const typedResult = result as {
    structuredContent?: unknown;
    content?: Array<{ type: string; text?: string }>
  };

  let data = null;
  if (typedResult.structuredContent) {
    data = typedResult.structuredContent;
  } else if (typedResult.content?.[0]?.type === "text" && typedResult.content[0].text) {
    data = JSON.parse(typedResult.content[0].text);
  }

  if (data) {
    renderUI(data);
  }
};
```

### Vite Configuration

Use `vite-plugin-singlefile` to bundle everything into a single HTML file:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  root: "src/ui/my-app",
  build: {
    outDir: "dist/ui",
    minify: "esbuild",
  },
});
```

## Testing with basic-host

### Setup

1. Clone the ext-apps repository:
```bash
git clone https://github.com/modelcontextprotocol/ext-apps.git /tmp/mcp-ext-apps
cd /tmp/mcp-ext-apps
npm install
```

2. Start your HTTP server (stateless mode):
```bash
cd your-mcp-server
npm run build
node dist/http-server.js
# Server runs on http://localhost:3001/mcp
```

3. Start basic-host pointing to your server:
```bash
cd /tmp/mcp-ext-apps/examples/basic-host
SERVERS='["http://localhost:3001/mcp"]' npm start
# Opens http://localhost:8080
```

### Using basic-host

1. Open http://localhost:8080 in your browser
2. Select your server from the dropdown
3. Select a tool with UI support (e.g., `get_worklogs`)
4. Enter JSON input: `{"startDate": "2026-01-01", "endDate": "2026-01-31"}`
5. Click "Call Tool"
6. Your UI renders in an iframe below

### Debugging

basic-host provides collapsible panels:
- **Tool Input** - The JSON sent to the tool
- **Tool Result** - The result returned
- **Messages** - Messages sent by the app
- **Model Context** - Context updates

Browser DevTools console shows `[HOST]` prefixed logs for:
- Server connections
- Tool calls
- App initialization
- App-to-host requests

## Rapid Iteration Workflow

1. **Edit UI files** in `src/ui/get-worklogs/` or `src/ui/get-schedule/`

2. **Rebuild just the UIs**:
```bash
npm run build:ui
```

3. **Refresh basic-host** (http://localhost:8080) to see changes instantly

No need to restart Claude Desktop for UI development!

## Common Issues & Solutions

### Issue: "Failed to connect to any servers"

**Cause**: HTTP server not running or CORS blocking requests.

**Solution**:
- Ensure HTTP server is running on the expected port
- Add `app.use(cors())` to your Express server
- Use stateless mode (`sessionIdGenerator: undefined`)

### Issue: Session ID not being sent

**Cause**: Stateful mode requires browsers to send custom headers, which can be blocked by CORS.

**Solution**: Use stateless mode for browser-based testing.

### Issue: UI not rendering in Claude Desktop

**Cause**: Various potential issues with metadata format or MIME type.

**Solution**:
- Ensure `_meta.ui.resourceUri` uses nested structure
- Ensure MIME type is exactly `text/html;profile=mcp-app`
- Verify handlers are registered BEFORE `app.connect()`

### Issue: Tool returns JSON instead of UI

**Cause**: Tool not linked to UI resource or host doesn't support MCP Apps.

**Solution**:
- Verify `_meta.ui.resourceUri` is set on the tool definition
- Check that the resource is registered with correct URI and MIME type
- Ensure the host supports the `io.modelcontextprotocol/ui` extension

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/http-server.ts` | HTTP server for testing with basic-host |
| `src/index.ts` | Main stdio server with tool/resource registration |
| `src/ui/*/index.ts` | UI app initialization and handlers |
| `src/ui/*/index.html` | UI HTML template |
| `src/ui/*/styles.css` | UI styles |
| `vite.config.ts` | Vite bundler configuration |

## Resources

- [MCP Apps Specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/)
- [MCP Apps SDK](https://github.com/modelcontextprotocol/ext-apps)
- [basic-host Example](https://github.com/modelcontextprotocol/ext-apps/tree/main/examples/basic-host)
- [basic-server-vanillajs Example](https://github.com/modelcontextprotocol/ext-apps/tree/main/examples/basic-server-vanillajs)
