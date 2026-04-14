# Userscripts improvement report

## Claude Usage Monitor
- **Current issues:** relied on noisy debug logging, overlapping refreshes, fragile response parsing, and a widget that could be restored off-screen.
- **Fixes:** removed noisy logging, switched to serialized refresh scheduling, expanded response normalization, added safer error handling, and clamped saved widget positions.
- **New functionality:** manual refresh button, “last updated” footer, and improved persistent expand/collapse behavior.

## Force font Domani
- **Current issues:** changed every element inline once, making it expensive, brittle on dynamic pages, and hard to disable.
- **Fixes:** replaced per-element inline styling with a single injected stylesheet and persistent state handling.
- **New functionality:** added an on-page toggle so the custom font can be enabled or disabled without editing the script.

## GitHub Copilot Usage Display
- **Current issues:** percentage detection depended on the first matching percent text and could easily pick the wrong value on the settings page.
- **Fixes:** added multiple parsing strategies for progress bars, embedded JSON, and scored text matches, plus clearer error states.
- **New functionality:** refresh timestamps, click-to-refresh feedback, and GitHub-theme-friendly pill styling.

## Good o'l Reddit
- **Current issues:** redirected every matching Reddit hostname, which risked breaking non-standard subdomains and offered no temporary escape hatch.
- **Fixes:** limited redirects to the main web hosts and kept the redirect logic explicit and safer.
- **New functionality:** added a session bypass via `?allowNewReddit=1` and a `?forceOldReddit=1` override to restore the redirect.

## Overleaf Compile Timer
- **Current issues:** the timer measured a fixed delay after clicking instead of the real compile request lifecycle.
- **Fixes:** rewired timing around actual compile-related network requests and added a DOM fallback for busy compile buttons.
- **New functionality:** live compile badge plus last compile duration summary.

## Overleaf ZIP Download with Date
- **Current issues:** filenames were only date-based, sanitization was weak, and there was no visible download status.
- **Fixes:** improved filename sanitization, added timestamp precision, centralized download handling, and hardened project-name/project-id lookup.
- **New functionality:** ZIP button with custom naming and inline status feedback for both PDF and ZIP downloads.

## Wikipedia Mobile to Desktop redirect
- **Current issues:** hostname replacement was overly simplistic and offered no way to stay on mobile when needed.
- **Fixes:** switched to URL-based hostname handling and safe desktop redirection with `location.replace`.
- **New functionality:** added a session bypass via `?keepMobileWikipedia=1`.

## arXiv PDF Downloader with Custom Filename
- **Current issues:** the script had a fixed filename format with no easy way to tweak or reuse it.
- **Fixes:** kept the metadata extraction path but improved duplicate-UI protection and filename normalization.
- **New functionality:** editable filename field, copy-to-clipboard button, and direct “Open PDF” link alongside the downloader.

## GitHub Copilot Model Multipliers
- **Current issues:** parsing depended on one table-discovery path and only decorated dropdown entries.
- **Fixes:** improved table discovery through header matching, added fetch fallback support, and kept richer cache metadata.
- **New functionality:** badges now also decorate current model selectors and expose cache/update metadata in tooltips.
