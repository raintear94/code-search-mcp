[![EN](https://img.shields.io/badge/EN-README-blue)](README.md) [![中文](https://img.shields.io/badge/中文-README_CN-red)](README_CN.md)

# Code Search MCP Server

High-performance, batch-oriented MCP (Model Context Protocol) code understanding toolkit for AI agents, **specially optimized for Java**.

Designed to solve the challenge where AI agents get "lost" in large codebases or lack precise context. It focuses on deep parsing, parallel batch processing, and panoramic context to explore large codebases efficiently, significantly reducing token usage while improving logical understanding.


## Use Cases
- **Panoramic Context**: Read multiple files in one call with dependency context auto-expanded.
- **Structural Mapping**: Build project outlines fast with deep Java annotation awareness.
- **Precise Surgery**: Precisely locate classes/methods/definitions and return in batch.

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

## Java Spring Deep Fit
More than just text search, it understands business logic:
- **Layer-Aware Ordering**: Intelligent sorting (Controller → Service → Impl → MQ → Repository) so AI understands the business flow immediately.
- **Deep Annotation-Awareness**: Instead of just seeing signatures, AI sees merged annotations (like `@Transactional`, `@PreAuthorize`) to understand business semantics.
- **Smart DI Parsing**: Automatically identifies injected fields (dependencies), eliminating the need for AI to guess where `userService` comes from.
- **Project Structure**: Full support for `src/main/java` and multi-module Maven/Gradle projects.

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
