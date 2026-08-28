# CSC S.Y.N.C. Organization Dashboard — Codex Modular Handoff

This ZIP was prepared so Codex can understand and refactor the organization dashboard more easily.

## What is inside

- `org-dashboard.html` — untouched current compacted dashboard fallback.
- `legacy/original-compacted/` — original dashboard and original uploaded ZIP.
- `src/legacy-bundle/` — virtual modules extracted from the embedded `moduleSources` object.
- `src/legacy-inline/` — every inline script extracted from `org-dashboard.html` in original order.
- `src/legacy-external-scripts/` — standalone JS files from the uploaded ZIP.
- `src/features/` — feature-based organization folders for future cleanup.
- `src/services/` — planned service layer for Supabase/data operations.
- `src/ui/` — UI polish, mobile, modal, sidebar, and visual fix scripts.
- `styles/` — extracted CSS and planned split CSS files.
- `docs/` — module map, bug-fix guide, extraction report, and structure tree.

## Current source summary

- Main dashboard: `org-dashboard.html`
- Approximate line count: 11,242 lines
- Inline script tags extracted: 14
- Inline style tags extracted: 5
- Virtual modules extracted: 11
- Files in uploaded ZIP: 8

## Recommended Codex instruction

Paste this into Codex:

> Read `CODEX_PROMPT.md` first. Preserve current behavior first. Do not optimize yet. Make the organization dashboard modular using the provided structure, then fix only the specific bug I mention.

