# MCPB/DXT Packaging Research

Research conducted: 2026-02-04

## Overview

This document captures research on how to properly package MCP servers as Desktop Extensions (MCPB/DXT) for Claude Desktop, with focus on eliminating Node.js runtime dependencies for end users.

## Key Finding: Current Implementation vs Intended Usage

### Current Implementation (Incorrect)

```json
{
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "npx",
      "args": ["@tranzact/tempo-filler-mcp-server"]
    }
  }
}
```

**Issues:**
- Uses `npx` which requires network access to npm registry
- Doesn't use Claude Desktop's bundled Node.js
- `server/index.js` is empty (placeholder)
- Defeats the purpose of MCPB bundling

### Correct Implementation

```json
{
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": {
        "TEMPO_PAT": "${user_config.tempo_pat}",
        "TEMPO_BASE_URL": "${user_config.tempo_base_url}"
      }
    }
  }
}
```

**Key differences:**
- `command` is `"node"` (uses Claude Desktop's bundled Node.js)
- `args` uses `${__dirname}` which resolves to bundle installation directory
- Server code is actually bundled in `server/` folder
- Works offline after installation

---

## MCP Server Language Distribution

From academic research analyzing 583 production-ready MCP servers:

| Language | Count | Percentage |
|----------|-------|-----------|
| TypeScript | 227 | 39.0% |
| Python | 196 | 33.6% |
| JavaScript | 115 | 19.7% |
| Others (Go, Rust, C#, Java) | 45 | 7.7% |

**Source:** [Model Context Protocol (MCP) at First Glance - arxiv.org](https://arxiv.org/html/2506.13538v2)

---

## Correct Bundle Structure

```
bundle.mcpb (ZIP archive)
├── manifest.json           # Required: Bundle metadata
├── package.json            # Optional: NPM package definition
├── server/
│   └── index.js            # Main entry point (compiled code)
├── node_modules/           # Production dependencies only
│   ├── @modelcontextprotocol/sdk/
│   └── ... other deps
├── icon.png                # Optional: 256x256 PNG
└── assets/                 # Optional: Additional resources
```

---

## Manifest.json Schema (Node.js)

From official MANIFEST.md specification:

```json
{
  "manifest_version": "0.3",
  "name": "server-name",
  "display_name": "Human Readable Name",
  "version": "1.0.0",
  "description": "Brief description",
  "author": {
    "name": "Author Name",
    "email": "email@example.com"
  },
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": {
        "CONFIG_VAR": "${user_config.config_var}"
      }
    }
  },
  "user_config": {
    "config_var": {
      "type": "string",
      "title": "Configuration Variable",
      "description": "Description for users",
      "required": true,
      "sensitive": false
    }
  },
  "compatibility": {
    "claude_desktop": ">=0.10.0",
    "platforms": ["darwin", "win32", "linux"],
    "runtimes": {
      "node": ">=16.0.0"
    }
  },
  "tools": [
    {
      "name": "tool_name",
      "description": "What the tool does"
    }
  ]
}
```

### Template Variables

| Variable | Description |
|----------|-------------|
| `${__dirname}` | Extension installation directory |
| `${HOME}` | User home directory |
| `${DESKTOP}` | Desktop folder |
| `${DOCUMENTS}` | Documents folder |
| `${DOWNLOADS}` | Downloads folder |
| `${user_config.KEY}` | User-provided configuration values |

---

## Real-World Example: things-mcpb

From [mbmccormick/things-mcpb](https://github.com/mbmccormick/things-mcpb):

### Manifest Configuration

```json
{
  "manifest_version": "0.2",
  "name": "things-mcpb",
  "display_name": "Things (AppleScript)",
  "version": "1.5.2",
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"]
    }
  },
  "compatibility": {
    "claude_desktop": ">=0.10.0",
    "platforms": ["darwin"],
    "runtimes": {
      "node": ">=18.0.0"
    }
  }
}
```

### Packaging Script

```json
{
  "scripts": {
    "package": "npm run build && rm -rf node_modules/esbuild node_modules/@esbuild node_modules/@anthropic-ai/mcpb && npx @anthropic-ai/mcpb pack . && npm ci"
  }
}
```

**Strategy:**
1. Build the project
2. Remove dev dependencies (esbuild, mcpb CLI) — 65% size reduction
3. Run `mcpb pack`
4. Reinstall deps for development

---

## Official hello-world-node Example

From [anthropics/mcpb/examples](https://github.com/anthropics/mcpb/tree/main/examples):

```json
{
  "$schema": "../../dist/mcpb-manifest.schema.json",
  "manifest_version": "0.3",
  "name": "hello-world-node",
  "display_name": "Hello World MCP Server (Reference Extension)",
  "version": "0.1.0",
  "description": "A reference MCP extension demonstrating best practices",
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": [
        "${__dirname}/server/index.js",
        "--verbose=${user_config.verbose_logging}",
        "--max-results=${user_config.max_results}"
      ],
      "env": {
        "API_KEY": "${user_config.api_key}",
        "DEBUG": "${user_config.debug_mode}"
      }
    }
  },
  "compatibility": {
    "claude_desktop": ">=0.10.0",
    "platforms": ["darwin", "win32", "linux"],
    "runtimes": {
      "node": ">=16.0.0"
    }
  }
}
```

---

## Alternatives to Node.js for Standalone Distribution

### Option 1: Go (Recommended for Standalone)

- Single binary, zero dependencies
- Cross-compile from one machine
- ~30-50MB binary size
- Library: [mark3labs/mcp-go](https://github.com/mark3labs/mcp-go) (8.1k stars)

```bash
GOOS=windows GOARCH=amd64 go build -o tempo-filler.exe
GOOS=darwin GOARCH=arm64 go build -o tempo-filler-mac
GOOS=linux GOARCH=amd64 go build -o tempo-filler-linux
```

### Option 2: Rust (Fastest Startup)

- Sub-second startup vs 4+ seconds for TypeScript
- Official SDK: [modelcontextprotocol/rust-sdk](https://github.com/modelcontextprotocol/rust-sdk)
- Smaller binaries than Go
- Steeper learning curve

### Option 3: pkg (Keep TypeScript)

- Bundle Node.js runtime into executable
- ~50-80MB per platform
- No code changes needed
- Package: [@yao-pkg/pkg](https://github.com/yao-pkg/pkg)

### Option 4: Bun compile

- Smaller than pkg (~30-50MB)
- May require minor code adjustments
- `bun build --compile ./src/index.ts --outfile tempo-filler`

---

## Update Mechanisms Comparison

| Approach | Update Friction | Requires Runtime | Network Required |
|----------|----------------|------------------|------------------|
| npx (current) | None (auto) | Node.js | Yes (always) |
| Proper MCPB | Manual download | None (bundled) | No (after install) |
| Standalone binary | Manual download | None | No |
| Package managers | `brew upgrade` | None | Yes (for update) |
| Self-updating binary | Low (auto-check) | None | Yes (for update) |

**Note:** Research found no evidence of automatic MCPB updates. Users must manually download and install new versions.

---

## MCPB CLI Commands

```bash
# Install CLI
npm install -g @anthropic-ai/mcpb

# Initialize manifest.json
mcpb init

# Validate manifest
mcpb validate manifest.json

# Create bundle
mcpb pack .

# Or use npx directly
npx -y @anthropic-ai/mcpb pack .
```

---

## Why Node.js is Recommended by Anthropic

From official documentation:

> "Anthropic recommends implementing MCP servers in Node.js rather than Python to reduce installation friction. Node.js ships with Claude for macOS and Windows, which means your bundle will work out-of-the-box for users without requiring them to install additional Python runtimes."

**Benefits:**
- Zero runtime installation for users
- Works offline after bundle installation
- No dependency conflicts
- Bundled Node.js version is controlled by Claude Desktop

---

## Sources

### Official Documentation
- [Anthropic Desktop Extensions Blog](https://www.anthropic.com/engineering/desktop-extensions)
- [MCPB Repository](https://github.com/anthropics/mcpb)
- [MCPB Manifest Specification](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md)
- [MCPB npm Package](https://www.npmjs.com/package/@anthropic-ai/mcpb)
- [Claude Help Center - Building MCPB Extensions](https://support.claude.com/en/articles/12922929-building-desktop-extensions-with-mcpb)

### Real-World Examples
- [things-mcpb](https://github.com/mbmccormick/things-mcpb) - Things task manager integration
- [hello-world-node](https://github.com/anthropics/mcpb/tree/main/examples/hello-world-node) - Official reference implementation
- [awesome-claude-dxt](https://github.com/milisp/awesome-claude-dxt) - Curated list of 300+ extensions

### Alternative Languages
- [mark3labs/mcp-go](https://github.com/mark3labs/mcp-go) - Go MCP SDK
- [modelcontextprotocol/rust-sdk](https://github.com/modelcontextprotocol/rust-sdk) - Official Rust SDK
- [Creating an MCP Server Using Go](https://dev.to/eminetto/creating-an-mcp-server-using-go-3foe)
- [MCPcat Go Guide](https://mcpcat.io/guides/building-mcp-server-go/)

### Research
- [Model Context Protocol (MCP) at First Glance](https://arxiv.org/html/2506.13538v2) - Academic analysis of 583 MCP servers
