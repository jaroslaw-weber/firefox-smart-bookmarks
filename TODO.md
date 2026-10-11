# Firefox Smart Bookmarks — Implementation Plan

## Goal
A Firefox extension that reads native bookmarks, uses AI to suggest categories/sorting, and applies an approved reorganization.

## Architecture

Firefox WebExtension (Manifest V2) with three pieces:

1. **manifest.json** — declares permissions, popup, options, background script.
2. **background.js** — owns bookmark reading/writing and API calls to the AI provider.
3. **popup/** + **options/** — UI for running analysis, reviewing suggestions, and configuring settings.

Data flow:
```
bookmarks API → background.js → AI provider (OpenRouter) → suggestions
        ▲                                                      │
        └──────────────  popup "Apply"  ◄──── review diff ─────┘
```

## Milestones

### M0 — Scaffold & core permissions
- [x] Create `manifest.json` (MV2 for bookmark write access simplicity).
- [x] Permissions: `bookmarks`, `storage`.
- [x] Popup + options HTML/JS skeleton wired to background via `runtime.sendMessage`.
- [x] Local install works: `web-ext run`.

### M1 — Read bookmarks
- [x] `background.js`: flatten `browser.bookmarks.getTree()` into a flat list of bookmarks with full path/ancestors.
- [x] Serialize to a compact prompt-friendly payload (title + URL + current folder).
- [x] Return tree summary + counts to popup ("You have N bookmark folders, M bookmarks").

### M2 — AI backend (OpenRouter)
- [x] Options UI: endpoint URL (default `https://openrouter.ai/api/v1/chat/completions`), model, API key.
- [x] Config stored in `storage.local`.
- [x] `askAI(bookmarks)` in background: build a strict-JSON prompt instructing the model to output:
  - proposed category list,
  - each bookmark → category mapping (+ optional rename/reorder).
- [x] Parse/validate the JSON response with a schema; fail gracefully with readable errors.
- [x] Provider-agnostic: default OpenRouter; allow swapping base URL for any OpenAI-compatible API.

### M3 — Suggestion diff / review
- [x] Represent proposed changes as a diff:
  - `createFolders[]`, `move[{path, folder}]`, `rename[{id, newTitle}]`.
- [x] Render diff in popup as a reviewable list grouped by target folder.
- [x] User can toggle each item (approve / skip) before applying.

### M4 — Apply changes
- [x] Use `bookmarks.create(status:'created')`, `bookmarks.move`, `bookmarks.update` in a sensible order (create folders → then moves).
- [x] Guard against duplicates and same-folder no-op moves.
- [x] Show summary after apply (folders created, bookmarks moved, skipped).

### M5 — Polish & safety
- [ ] "Undo"/dry-run mode; confirmation before destructive ops.
- [ ] Handle errors: missing/expired API key, rate limits, invalid JSON, permissions.
- [ ] Loading states and empty states in UI.

## Open decisions
- MV2 vs MV3: MV3 background service workers complicate storing a revocable AI client; start MV2 for simplicity, revisit later.
- Full auto vs review-then-apply: default to review-then-apply (non-destructive). A "trusted auto-apply" toggle possible later.
- Provider: default OpenRouter (no canned tokens required, no-capacity), single API key configured in options.

## Testing strategy
- Manual with `web-ext` against a test Firefox profile containing sample bookmarks.
- Add `bookmarks.getSubTree`-based fixtures for prompt/parse unit tests (Node, no deps).

## Milestone order rationale
Read (M1) → ask (M2) → review (M3) → apply (M4) → safety/polish (M5) so each milestone yields a runnable, verifiable step.