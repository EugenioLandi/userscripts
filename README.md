# userscripts

Personal userscript collection for Tampermonkey-compatible managers such as Tampermonkey, Violentmonkey, and Greasemonkey.

The repository focuses on small, single-purpose scripts that smooth out repetitive workflows in Overleaf, GitHub, Claude, Reddit, Wikipedia, and arXiv.

## What is in this repository

- Standalone userscripts live at the repository root.
- Original pre-cleanup copies are preserved in `/original-userscripts`.
- A change summary from the cleanup pass lives in `/userscripts-report.md`.
- Scripts are distributed directly from the `main` branch through each file's `@updateURL` and `@downloadURL` metadata.

## Requirements

- A browser userscript manager:
  - [Tampermonkey](https://www.tampermonkey.net/)
  - [Violentmonkey](https://violentmonkey.github.io/)
  - [Greasemonkey](https://www.greasespot.net/)
- Access to the matching site for the script you want to use.

## Installation

1. Open the script file you want from this repository.
2. Use the raw GitHub URL for that file.
3. Open the raw URL in a browser with your userscript manager installed.
4. Review the permissions and install it.

Raw URL pattern:

`https://raw.githubusercontent.com/EugenioLandi/userscripts/main/<script file name>`

Because the filenames contain spaces, keep the exact filename or use the browser's copied raw link.

## Updating scripts

Most scripts include both `@updateURL` and `@downloadURL`, so installed copies can update automatically from this repository.

If you want a manual refresh:

1. Open the installed script in your userscript manager.
2. Compare it with the current repository version.
3. Reinstall from the raw URL if needed.

## Repository layout

```text
/
├── <userscript files>
├── original-userscripts/        # preserved originals
├── README.md                    # repository documentation
├── userscripts-report.md        # cleanup summary
└── autoupdate-report.md         # notes about raw GitHub auto-updates
```

## Script catalog

### Overleaf

#### Overleaf Compile Timer
- **Site:** `https://*.overleaf.com/*`
- **Purpose:** shows how long each Overleaf compile takes.
- **Best for:** tracking slow documents and compile regressions while editing.

#### Overleaf GitHub Shortcut
- **Site:** `https://*.overleaf.com/*`
- **Purpose:** adds a GitHub shortcut next to the PDF and ZIP controls in the editor toolbar.
- **Best for:** opening the GitHub sync/integration UI without walking through project menus every time.

**What it does**
- Adds a compact GitHub icon button beside the existing Overleaf export controls.
- Searches for the current GitHub sync target already present in the page.
- If the target is not rendered yet, it opens likely Overleaf menu triggers and waits for the GitHub action to appear.
- Falls back to project settings if Overleaf changes the UI and the dedicated target cannot be detected.
- Shows inline status text so you can tell whether it opened the integration directly or had to fall back.

**Why this script exists**
- Overleaf hides the GitHub integration behind project UI controls.
- The default flow requires several clicks and depends on where the relevant menu is currently mounted.
- This script keeps the action close to the PDF/ZIP buttons, which are usually already visible while editing.

**Current behavior**
- The shortcut now tries multiple activation styles when opening Overleaf's menu controls, which makes the first use work even when the GitHub entry has not been manually opened before in the current page session.
- If Overleaf's interface changes enough that the script cannot find the GitHub target, it still opens project settings as a safe fallback.

**How to use**
1. Open an Overleaf project.
2. Wait for the PDF button to appear in the toolbar.
3. Click the GitHub icon inserted beside the PDF/ZIP controls.
4. Watch the inline status text if nothing opens immediately.

**Troubleshooting**
- If the button is missing, wait until the editor toolbar finishes loading.
- If Overleaf changes its UI, reinstall the latest version from this repository.
- If the shortcut opens project settings instead of the GitHub integration, Overleaf likely changed the integration entry point and the script needs an update.

#### Overleaf New Command Builder
- **Site:** `https://*.overleaf.com/*`
- **Purpose:** helps build new LaTeX command snippets more quickly.
- **Best for:** repetitive macro creation.

#### Overleaf Notes and Checklist
- **Site:** `https://*.overleaf.com/*`
- **Purpose:** adds lightweight note-taking and checklist support inside Overleaf.
- **Best for:** keeping writing tasks and reminders attached to the current editing session.

#### Overleaf ZIP Download with Date
- **Site:** `https://*.overleaf.com/*`
- **Purpose:** adds a ZIP download control with timestamped filenames.
- **Best for:** keeping exported archives organized outside Overleaf.

### GitHub

#### GitHub Copilot Usage Display
- **Site:** GitHub Copilot and related GitHub pages.
- **Purpose:** surfaces Copilot usage details directly on GitHub pages.
- **Best for:** quickly checking personal usage without extra navigation.

#### GitHub Copilot Model Multiplier
- **Site:** GitHub Copilot pages.
- **Purpose:** helps interpret Copilot request costs across models.
- **Best for:** understanding effective usage impact when switching models.

### Claude

#### Claude Usage Monitor
- **Site:** Claude web app pages.
- **Purpose:** exposes usage information in the interface.
- **Best for:** keeping track of remaining usage while working.

### Web browsing helpers

#### Good o'l Reddit
- **Site:** Reddit.
- **Purpose:** restores a more classic Reddit experience.

#### Wikipedia Mobile to Desktop redirect
- **Site:** Wikipedia mobile pages.
- **Purpose:** redirects mobile Wikipedia URLs to the desktop site.

#### arXiv PDF Downloader with Custom Filename
- **Site:** arXiv.
- **Purpose:** downloads PDFs with a more useful custom filename format.

## Development notes

- Scripts are plain userscript files without a repository-wide build step.
- The repository currently uses direct file editing rather than a package-managed build system.
- For quick validation, scripts can be syntax-checked individually with Node.js:

```bash
node --check "/absolute/path/to/script"
```

## Contributing to your own fork

If you adapt these scripts for your own use:

1. Keep `@updateURL` and `@downloadURL` aligned with the branch and path you distribute from.
2. Re-test each edited script on the target website because these scripts depend heavily on site-specific DOM structure.
3. Prefer small, targeted changes because most scripts rely on brittle UI selectors by necessity.
