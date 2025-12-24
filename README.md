# Code Search MCP Server

High-performance, batch-oriented MCP (Model Context Protocol) code understanding toolkit for AI agents. Focused on deep parsing, parallel batch processing, and panoramic context to explore large codebases efficiently.

---

## Use Cases
- Read multiple files in one call with dependency context auto-expanded.
- Build project outlines fast with Java annotation awareness.
- Precisely locate classes/methods/definitions and return in batch.

## Core Tools
| Tool | Capability | Notes |
| --- | --- | --- |
| `view_files_full_context` | Panoramic context | Batch read with dependency + model field expansion |
| `view_files_outlines` | Structural outline | Batch outline extraction with Java annotation awareness |
| `view_code_items` | Precise location | Batch locate classes/methods/definitions |

## Design Notes
- **stdio transport**: JSON-RPC 2.0 via standard I/O.
- **Deterministic protocol**: absolute paths only, no path wildcards.
- **Java outline enhancement**: annotation backtracking merged into signatures.

## Java Spring Fit
- **Layer-aware ordering**: Controller → Service → Impl → MQ → Mapper/Repository/DAO.
- **Annotation-aware**: annotations are merged into signatures.
- **DI parsing**: common injected fields are listed automatically.
- **Project layout**: supports `src/main/java` and multi-module Java projects.

## Requirements
- Node.js v18.0.0 or later

## Install & Build
```bash
npm install
npm run build
```

## Integration
```json
"mcpServers": {
  "code-search": {
    "command": "node",
    "args": ["{file}/code-search/index.js"]
  }
}
```

## Tips
- **Prefer** `view_files_full_context` for full context in one call.
- **Absolute paths** are required for stability and reproducibility.
- **Complex queries** should be split into precise calls.

## Open Source
This project is open-sourced under the MIT License. You may use, modify, and distribute it under the license terms.
[English](README.md) | [中文](README_CN.md)

