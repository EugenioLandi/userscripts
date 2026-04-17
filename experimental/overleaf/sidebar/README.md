# Experimental Overleaf native sidebar userscripts

This folder contains experimental Overleaf userscripts that mount into the **existing native left sidebar** instead of drawing a floating custom rail. Each script adds its own icon beside Overleaf's built-in sidebar buttons and renders inside the same panel surface.

## Included integrations

1. **Overleaf Sidebar Local Notepad (Experimental)**
   - Adds a per-project notes panel inside the native sidebar.
2. **Overleaf Sidebar Quick Links (Experimental)**
   - Adds common project destinations such as editor, history, settings, and downloads.
3. **Overleaf Sidebar Project Info (Experimental)**
   - Adds copy-friendly project metadata and link helpers.
4. **Overleaf Sidebar Recent Projects (Experimental)**
   - Adds a local recent-project switcher.
5. **Overleaf Sidebar Compile Insights (Experimental)**
   - Adds compile timing history for the current project.
6. **Overleaf Sidebar Checklist (Experimental)**
   - Adds a per-project task checklist.

## How it works

- Each userscript automatically loads the shared helper `_nativeSidebarHost.js` via `@require`.
- The helper finds Overleaf's existing left sidebar tab strip and panel container, clones the native tab button structure, and mounts custom panel content into the same sidebar surface.
- Stored data stays in `localStorage`, so all notes and project-specific state remain local to your browser.

## Validation

Every script in this folder, including the shared helper, can be checked with:

```bash
node --check /absolute/path/to/script
```
