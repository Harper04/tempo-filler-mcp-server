# MCPB Proper Bundling Specification

## Overview

This spec defines the migration from the current "npx wrapper" MCPB implementation to proper bundling that includes all server code and dependencies. The goal is to create a self-contained bundle that works offline and uses Claude Desktop's bundled Node.js runtime.

**Current State:** The MCPB bundle uses `npx @tranzact/tempo-filler-mcp-server` which requires network access and doesn't use Claude Desktop's bundled Node.js.

**Target State:** A proper MCPB bundle that includes compiled server code and production dependencies, enabling offline installation and execution via Claude Desktop's bundled Node.js.

## Goals

- Create a self-contained MCPB bundle that works offline after installation
- Use Claude Desktop's bundled Node.js (no user runtime installation required)
- Maintain the existing npm distribution for `npx` users
- Minimize bundle size by excluding dev dependencies
- Follow official MCPB best practices from Anthropic

## Requirements

### Functional Requirements

- **FR1**: Bundle must include compiled TypeScript output (`dist/`) in `server/` folder
- **FR2**: Bundle must include production `node_modules/` with all runtime dependencies
- **FR3**: Manifest must use `"command": "node"` with `${__dirname}` path resolution
- **FR4**: Bundle must work without network access after installation
- **FR5**: User configuration (TEMPO_PAT, TEMPO_BASE_URL) must be passed via environment variables
- **FR6**: npm package distribution must continue working unchanged (`npx @tranzact/tempo-filler-mcp-server`)

### Non-Functional Requirements

- **NFR1**: Bundle size should be under 15MB (production deps only)
- **NFR2**: Bundle creation should complete in under 30 seconds
- **NFR3**: No breaking changes to existing npm users

### Technical Constraints

- **TC1**: Must use manifest_version "0.2" or "0.3" (compatible with Claude Desktop)
- **TC2**: Must support platforms: darwin, win32, linux
- **TC3**: Must require Node.js >= 18.0.0 runtime
- **TC4**: Dev dependencies (typescript, vite, @anthropic-ai/mcpb) must NOT be included in bundle

## Current vs Target Architecture

### Current (Incorrect)

```
bundle/
├── manifest.json          ← Uses npx command
└── server/
    └── index.js           ← Empty file (0 bytes)
```

```json
{
  "mcp_config": {
    "command": "npx",
    "args": ["@tranzact/tempo-filler-mcp-server"]
  }
}
```

### Target (Correct)

```
bundle/
├── manifest.json          ← Uses node + ${__dirname}
├── package.json           ← Production package info
├── server/
│   ├── index.js           ← Compiled entry point
│   ├── tempo-client.js    ← Compiled modules
│   ├── handlers.js
│   └── ...                ← All dist/ files
└── node_modules/          ← Production dependencies only
    ├── @modelcontextprotocol/
    ├── axios/
    ├── date-fns/
    └── ...
```

```json
{
  "mcp_config": {
    "command": "node",
    "args": ["${__dirname}/server/index.js"]
  }
}
```

## Implementation Tasks

### Phase 1: Update Manifest

- [ ] Update `bundle/manifest.json` to use proper local execution
- [ ] Change `mcp_config.command` from `"npx"` to `"node"`
- [ ] Change `mcp_config.args` to `["${__dirname}/server/index.js"]`
- [ ] Update `manifest_version` to `"0.3"` if needed
- [ ] Verify `user_config` variables map correctly to environment

### Phase 2: Create Bundle Build Script

- [ ] Create `scripts/build-mcpb.js` to automate bundle creation
- [ ] Script must: compile TypeScript (`tsc`)
- [ ] Script must: copy `dist/` contents to `bundle/server/`
- [ ] Script must: create production `node_modules/` in bundle
- [ ] Script must: create minimal `package.json` in bundle
- [ ] Script must: exclude dev dependencies from bundle

### Phase 3: Update Build Pipeline

- [ ] Add new npm script `build:mcpb` for bundle creation
- [ ] Update existing `build` script to use new bundling approach
- [ ] Ensure `prepublishOnly` still builds npm package correctly
- [ ] Test that npm package still works with `npx`

### Phase 4: Update GitHub Actions

- [ ] Update `.github/workflows/release.yml` to use new build process
- [ ] Verify bundle is correctly attached to GitHub releases
- [ ] Test installation from downloaded bundle

## Acceptance Criteria

### Bundle Structure
- [ ] `bundle/server/index.js` contains compiled entry point (not empty)
- [ ] `bundle/server/` contains all files from `dist/`
- [ ] `bundle/node_modules/` contains production dependencies
- [ ] `bundle/node_modules/` does NOT contain typescript, vite, or @anthropic-ai/mcpb
- [ ] `bundle/package.json` exists with production metadata

### Manifest Configuration
- [ ] `manifest.json` uses `"command": "node"`
- [ ] `manifest.json` uses `"args": ["${__dirname}/server/index.js"]`
- [ ] Environment variables use `${user_config.*}` syntax
- [ ] `manifest_version` is "0.2" or "0.3"

### Functionality
- [ ] Bundle installs in Claude Desktop via double-click
- [ ] Server starts without network access
- [ ] All 5 tools work correctly (get_worklogs, post_worklog, bulk_post_worklogs, delete_worklog, get_schedule)
- [ ] User configuration prompts appear during installation
- [ ] Secrets stored in OS keychain (via Claude Desktop)

### npm Compatibility
- [ ] `npx @tranzact/tempo-filler-mcp-server` still works
- [ ] npm package size unchanged
- [ ] No breaking changes to existing users

## Usage Examples

### Build Commands

```bash
# Build npm package (existing)
npm run build

# Build MCPB bundle (new)
npm run build:mcpb

# Build both
npm run build:all
```

### Bundle Build Script (scripts/build-mcpb.js)

```javascript
#!/usr/bin/env node
import { execSync } from 'child_process';
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const BUNDLE = join(ROOT, 'bundle');
const DIST = join(ROOT, 'dist');

// 1. Clean bundle/server and bundle/node_modules
rmSync(join(BUNDLE, 'server'), { recursive: true, force: true });
rmSync(join(BUNDLE, 'node_modules'), { recursive: true, force: true });

// 2. Compile TypeScript
execSync('npm run build:ui && tsc', { stdio: 'inherit' });

// 3. Copy dist/ to bundle/server/
mkdirSync(join(BUNDLE, 'server'), { recursive: true });
cpSync(DIST, join(BUNDLE, 'server'), { recursive: true });

// 4. Install production dependencies in bundle
mkdirSync(join(BUNDLE, 'node_modules'), { recursive: true });
execSync('npm install --production --prefix bundle', { stdio: 'inherit' });

// 5. Create minimal package.json for bundle
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const bundlePkg = {
  name: pkg.name,
  version: pkg.version,
  type: 'module',
  dependencies: pkg.dependencies
};
writeFileSync(join(BUNDLE, 'package.json'), JSON.stringify(bundlePkg, null, 2));

// 6. Pack with mcpb
execSync('npx @anthropic-ai/mcpb pack bundle', { stdio: 'inherit' });

console.log('MCPB bundle created successfully!');
```

### Updated manifest.json

```json
{
  "manifest_version": "0.3",
  "name": "tempo-filler-mcp-server",
  "display_name": "Tempo Filler MCP Server",
  "version": "2.0.1",
  "description": "A Model Context Protocol (MCP) server for managing Tempo worklogs in JIRA.",
  "author": {
    "name": "JuanjoFuchs",
    "email": "juanjose.fuchs@tranzact.net"
  },
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": {
        "TEMPO_BASE_URL": "${user_config.tempo_base_url}",
        "TEMPO_PAT": "${user_config.tempo_pat}",
        "TEMPO_DEFAULT_HOURS": "${user_config.tempo_default_hours}"
      }
    }
  },
  "user_config": {
    "tempo_base_url": {
      "type": "string",
      "title": "Tempo Base URL",
      "description": "Your JIRA/Tempo instance base URL (e.g., https://your-company.atlassian.net)",
      "required": true
    },
    "tempo_pat": {
      "type": "string",
      "title": "Tempo Personal Access Token",
      "description": "Your Tempo Personal Access Token for API authentication",
      "required": true,
      "sensitive": true
    },
    "tempo_default_hours": {
      "type": "number",
      "title": "Default Hours Per Day",
      "description": "Default number of hours to log per day when not specified",
      "required": false,
      "default": 8
    }
  },
  "compatibility": {
    "claude_desktop": ">=0.10.0",
    "platforms": ["darwin", "win32", "linux"],
    "runtimes": {
      "node": ">=18.0.0"
    }
  },
  "tools": [
    {
      "name": "get_worklogs",
      "description": "Retrieve worklogs for authenticated user and date range"
    },
    {
      "name": "post_worklog",
      "description": "Create a new worklog entry"
    },
    {
      "name": "bulk_post_worklogs",
      "description": "Create multiple worklog entries from a structured format"
    },
    {
      "name": "delete_worklog",
      "description": "Delete an existing worklog entry"
    },
    {
      "name": "get_schedule",
      "description": "Retrieve work schedule for authenticated user and date range"
    }
  ],
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/TRANZACT/tempo-filler-mcp-server"
  }
}
```

## Success Criteria

| Metric | Target |
|--------|--------|
| Bundle size | < 15 MB |
| Build time | < 30 seconds |
| Offline installation | Works |
| Tool functionality | All 5 tools work |
| npm compatibility | No breaking changes |

## Testing Approach

### Validation Steps

1. Build the bundle: `npm run build:mcpb`
2. Verify bundle contents:
   ```bash
   # Check server files exist
   ls -la bundle/server/

   # Check node_modules exists
   ls bundle/node_modules/

   # Check no dev deps
   ls bundle/node_modules/ | grep -E "(typescript|vite)" # should be empty
   ```
3. Install in Claude Desktop (double-click `.mcpb` file)
4. Disconnect from internet
5. Test each tool in Claude Desktop

### Test Cases

| Scenario | Expected Result |
|----------|-----------------|
| Install bundle offline | Installation completes, no errors |
| Call `get_schedule` offline | Returns schedule data |
| Call `post_worklog` offline | Creates worklog (when online) |
| npm install + npx | Works unchanged |
| Bundle size | Under 15 MB |

## Out of Scope

- Automatic update mechanism for MCPB bundles
- Self-updating binary distribution
- Rewriting server in Go or Rust
- Changes to core server functionality
- Publishing to package managers (Homebrew, Chocolatey)

## Future Considerations

- **Automatic Updates**: Research if/when Claude Desktop adds auto-update for MCPB
- **Binary Distribution**: Consider Go rewrite if MCPB approach becomes problematic
- **Size Optimization**: Use esbuild to bundle server code into single file (reduces node_modules)

## References

- [MCPB Packaging Research](../ai-docs/mcpb-packaging-research.md)
- [MCPB Manifest Specification](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md)
- [Official MCPB Examples](https://github.com/anthropics/mcpb/tree/main/examples)
- [things-mcpb Real-World Example](https://github.com/mbmccormick/things-mcpb)
- [Anthropic Desktop Extensions Blog](https://www.anthropic.com/engineering/desktop-extensions)
