# CLAUDE.md — DocsContext Development Guide

## Project Overview

DocsContext is a GraphRAG-powered documentation search tool written in Go. It indexes documents (PDF, DOCX, TXT, MD, web pages) into a knowledge graph with entity extraction, community detection, and vector embeddings, then answers queries using a combination of graph search and vector similarity.

## Build & Test

```bash
go build ./...
go test ./...
go run . --help
```

## Architecture

```
cmd/           CLI commands (cobra): index, serve, search, version
internal/
  api/         REST API handlers
  chunker/     Text splitting into overlapping chunks
  community/   Louvain community detection + summarization
  config/      Viper-based YAML config loading
  crawler/     Web page crawler
  embedder/    Batched text → vector embedding
  extractor/   LLM-based entity/relationship/claims extraction
  llm/         LLM provider abstraction (Azure OpenAI, Ollama)
  loader/      Document loaders (PDF, DOCX, TXT, MD, web)
  mcp/         Model Context Protocol server
  pipeline/    5-phase GraphRAG indexing pipeline
  search/      Query engine (local + global search)
  store/       SQLite storage layer
```

## Supported LLM Providers

Only **Azure OpenAI** and **Ollama** are supported. HuggingFace was removed.

## Recent Changes (already committed)

The following improvements are already committed to the branch `claude/fix-codecontext-config-DR15O`:

1. **Config fix**: Loads config from `~/.docscontext/` (lowercase) and supports both `.yaml` and `.yml`
2. **HuggingFace removal**: Dropped HuggingFace provider, config struct, and defaults
3. **GraphRAG quality improvements** (aligned with Microsoft GraphRAG):
   - **Gleanings**: Multi-pass entity extraction in `internal/extractor/entities.go` (configurable via `indexing.max_gleanings`, default: 1)
   - **Improved extraction prompt**: Few-shot examples, 10 entity types, weight guidance, implicit relationship extraction
   - **Entity name normalization**: Case-insensitive dedup in `internal/pipeline/pipeline.go`
   - **Relationship deduplication**: By (source, target, predicate) in pipeline
   - **Fixed Louvain modularity formula**: Correct ΔQ calculation in `internal/community/louvain.go`

## Completed Integrations

**langchaingo** is used for:
- **LLM providers** — `internal/llm/provider.go` wraps langchaingo for Azure OpenAI and Ollama (replaced custom HTTP clients)
- **Text splitting** — `internal/chunker/chunker.go` uses `textsplitter.RecursiveCharacter`
- **PDF loading** — `internal/loader/pdf.go` uses `documentloaders.NewPDF()` (replaced pdfcpu Tj/TJ parser)

## Recent Bug Fixes

- Background goroutine context leak fix in API upload handler
- Job progress tracking uses proper map with atomic counter
- Temp directory cleanup on early upload errors
- Entity/relationship dedup improvements in extractor (case-insensitive, relationship dedup)
- Vector count validation in embedder and pipeline
- Panic recovery middleware added to API
- Schema migration error handling improved in store

## Code Style

- Use `slog` for logging with emoji prefixes (📄 ✅ ⚠️ ❌ 🔗 🧩 💾 🌐 ⏭️ ⚙️)
- Error wrapping: `fmt.Errorf("context: %w", err)`
- Concurrency: use semaphore channels (`make(chan struct{}, N)`) for limiting parallelism
- Config: Viper with `mapstructure` tags, env prefix `DocsContext`

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |
