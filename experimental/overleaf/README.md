# Experimental Overleaf userscripts

This folder contains 10 standalone userscripts for [Overleaf](https://www.overleaf.com/). They are intentionally grouped under `experimental/overleaf` so you can try them one by one without mixing them with the more polished top-level scripts in the repository.

## Who this is for

Use this collection if you spend a lot of time in Overleaf and you want to remove small bits of friction: repetitive clicks, hard-to-find links, cramped layouts, missing local notes, or lack of quick context about a project.

## Installation

1. Install a userscript manager such as Tampermonkey.
2. Open any script file in this folder from the repository raw URL.
3. Install only the scripts you actually want; every file works independently.
4. Refresh Overleaf after installation.

## Notes before you install

- These scripts target `https://*.overleaf.com/*` or `https://*.overleaf.com/project/*`.
- They are designed to be safe, local browser customizations. They do not require external services.
- A few scripts store preferences or data in `localStorage` so they persist between sessions.
- Overleaf changes its UI from time to time. Because this folder is experimental, selectors may need future adjustments.

## Included userscripts

### 1. Overleaf Compile Timer (Experimental)
**Why use it:** compiling is one of the most repeated actions in Overleaf, but the default UI does not tell you how long a compile actually took.

**Problem it solves:** when builds feel slow, it is hard to know whether the delay is real, intermittent, or caused by a specific change in your document.

**How to use it:** install the script and open any Overleaf project. Start a compile as usual. A compact badge appears next to the compile control and updates live while the request is in flight.

**What it gives you:**
- a live timer during compilation
- the duration of the last completed compile
- a quick visual cue when Overleaf is still busy

### 2. Overleaf ZIP Download with Date (Experimental)
**Why use it:** downloading project snapshots is useful for archives, backups, and submission checkpoints, but default filenames are easy to lose in a downloads folder.

**Problem it solves:** exported PDFs and ZIP files often end up with generic names, which makes it hard to track which file belongs to which milestone.

**How to use it:** install the script, then use the PDF download control or the added ZIP button in the project toolbar. Files are saved with the project name plus a timestamp.

**What it gives you:**
- timestamped PDF filenames
- a dedicated ZIP export button
- inline status messages while downloads are running

### 3. Overleaf GitHub Shortcut (Experimental)
**Why use it:** if you sync Overleaf with GitHub, the built-in route to the integration is buried behind menus.

**Problem it solves:** too many clicks just to reach the GitHub integration, especially when you need to check sync settings repeatedly.

**How to use it:** install the script and open a project. A GitHub shortcut appears near the PDF and ZIP controls. Click it to open the GitHub integration, or at least jump straight to project settings if the UI entry is hidden.

**What it gives you:**
- one-click access to the GitHub integration path
- menu fallback logic when Overleaf moves the entry around
- status feedback when the integration button cannot be found immediately

### 4. Overleaf Focus Mode Toggle
**Why use it:** sometimes you want to write without review panels, chat, comments, or file-tree clutter taking visual attention.

**Problem it solves:** Overleaf can feel busy when you are doing uninterrupted drafting or line-by-line edits.

**How to use it:** install the script and open a project. Use the floating `Focus` button or press `Alt+Shift+F` to toggle the mode. The preference is remembered for later sessions.

**What it gives you:**
- a persistent distraction-reduction mode
- faster access to a cleaner writing surface
- a simple keyboard shortcut for switching contexts

### 5. Overleaf Wide Editor Toggle
**Why use it:** dual-pane editing is better when the content area can grow wider, especially on large monitors.

**Problem it solves:** default layout constraints can leave too much unused space, which makes both source and preview panes feel narrower than necessary.

**How to use it:** install the script and toggle it with the floating `Wide` button or `Alt+Shift+W`.

**What it gives you:**
- wider editor and preview panes
- fewer unnecessary max-width constraints
- a persistent layout preference for big screens

### 6. Overleaf Dark PDF Preview Toggle
**Why use it:** reading the PDF preview at night or during long editing sessions can be tiring on bright white backgrounds.

**Problem it solves:** Overleaf does not offer a lightweight dark-preview option for the rendered output pane.

**How to use it:** install the script and open a project. Use the floating preview toggle or press `Alt+Shift+D`.

**What it gives you:**
- a darker preview surface
- inverted PDF pages for lower eye strain
- a fast local toggle without changing Overleaf itself

### 7. Overleaf Quick Navigation Tray
**Why use it:** moving between the editor, history, settings, dashboard, and docs is common, but the navigation is spread across the interface.

**Problem it solves:** repetitive page-switching costs time, especially when you bounce between project settings, history, and the main editor.

**How to use it:** install the script and look for the small tray at the top-left of Overleaf. Collapse it if you want, or use it as a persistent set of shortcuts.

**What it gives you:**
- direct links to the most-used project destinations
- a quick path to ZIP exports and Overleaf docs
- a collapsible utility tray that stays out of the way

### 8. Overleaf Copy Project Info
**Why use it:** project IDs and URLs are often needed for notes, bug reports, collaboration messages, or personal tracking.

**Problem it solves:** copying all relevant project details manually is repetitive and error-prone.

**How to use it:** install the script and click `Copy project info` inside a project.

**What it gives you:**
- the project name and project ID
- editor, history, and settings URLs
- a ready-to-paste Markdown link for notes or tickets

### 9. Overleaf Recent Projects Panel
**Why use it:** when you alternate between several papers or reports, reopening the same set of projects can take longer than it should.

**Problem it solves:** Overleaf does not give you a small always-there personal shortlist that follows you around the site.

**How to use it:** install the script and open projects normally. The panel builds itself over time from the projects you visit and keeps the latest ones in local browser storage.

**What it gives you:**
- a rolling list of recently opened projects
- fast switching without hunting through the dashboard
- timestamps so you can see what you touched most recently

### 10. Overleaf Local Notes Pad
**Why use it:** many people keep a separate scratch file, TODO list, or reminder note while working in Overleaf.

**Problem it solves:** quick project-specific notes usually live in another app, another tab, or temporary comments in the document itself.

**How to use it:** install the script and open a project. A small notes pad appears in the lower-left corner. Type anything you want; it is saved locally in your browser for that project.

**What it gives you:**
- a per-project scratchpad
- instant autosave using local storage
- a simple place for review feedback, deadlines, or compile reminders without touching the manuscript source

## Recommended combinations

If you want a lighter writing workflow, combine:
- Focus Mode Toggle
- Wide Editor Toggle
- Dark PDF Preview Toggle

If you want project-management helpers, combine:
- ZIP Download with Date
- GitHub Shortcut
- Copy Project Info
- Recent Projects Panel
- Local Notes Pad

If you mainly care about feedback loops while editing, combine:
- Compile Timer
- Quick Navigation Tray
- ZIP Download with Date

## Validation

Each script in this folder is a standalone userscript and can be syntax-checked individually with:

```bash
node --check /absolute/path/to/script
```
