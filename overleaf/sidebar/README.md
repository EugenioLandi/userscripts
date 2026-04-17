# Overleaf sidebar userscripts

This folder contains Overleaf userscripts that plug into a shared, native-like custom sidebar. Each script adds its own icon to the sidebar rail and opens its own panel, so you can install just one or mix several together.

## Sidebar integrations in this folder

1. **Overleaf Sidebar Local Notepad**
   - Adds a per-project scratchpad inside the sidebar.
   - Solves the problem of keeping reminders and review notes without opening another app.

2. **Overleaf Sidebar Quick Links**
   - Adds a compact project navigation panel.
   - Solves repeated clicks between editor, history, settings, downloads, and dashboard.

3. **Overleaf Sidebar Project Info**
   - Adds copyable project metadata.
   - Solves repetitive manual copying of URLs and project IDs for tickets, chats, and notes.

4. **Overleaf Sidebar Recent Projects**
   - Adds a local recent-project list.
   - Solves the need to reopen the same working set of documents quickly.

5. **Overleaf Sidebar Compile Insights**
   - Adds recent compile timing history.
   - Solves the lack of a persistent project-specific timing view inside the editor.

6. **Overleaf Sidebar Checklist**
   - Adds a per-project checklist.
   - Solves lightweight task tracking for writing, figures, references, and submission prep.

## Notes

- These scripts are standalone; each can be installed independently.
- When more than one is installed, they share the same sidebar host and appear as separate icons in the same rail.
- Stored data uses `localStorage`, so notes, recent projects, and checklist items stay in your browser.
- Because Overleaf can change its DOM, these scripts are intentionally kept in a dedicated folder instead of being mixed into the top-level stable scripts.

## Validation

Each userscript here can be checked with:

```bash
node --check /absolute/path/to/script
```
