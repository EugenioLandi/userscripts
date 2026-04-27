# Vinted Item ZIP Backup report

## Overview

`Vinted Item ZIP Backup` adds a floating **Save item as ZIP** button on Vinted item pages and creates a downloadable archive of the current listing.

The script is designed for Vinted item URLs such as `/items/<id>`. It aims to capture as much listing data as the live page exposes at archive time.

## What the ZIP contains

When the page exposes the data, the archive includes:

- `metadata.json`
  - normalized item metadata
  - item id
  - page URL and canonical URL
  - page title
  - listing title
  - description
  - price details
  - detected currency
  - seller username
  - seller id when available
  - seller profile URL
  - seller avatar URL
  - brand
  - category
  - size
  - condition
  - color
  - material
  - location
  - favorite count when exposed by the page data
  - view count when exposed by the page data
  - upload date when exposed by the page data
  - detected photo URLs
  - breadcrumbs
  - extracted attributes from visible definition lists or tables
- `summary.txt`
  - readable summary of the main listing details
- `photos/`
  - every detected item photo that the script manages to download
- `seller/avatar.*`
  - seller avatar if it is exposed on the page and downloadable
- `raw/meta-tags.json`
  - all page meta tags collected from the document
- `raw/json-ld.json`
  - parsed JSON-LD blocks
- `raw/parsed-json-scripts.json`
  - parsed JSON script blocks found in the page
- `raw/json-parse-failures.json`
  - JSON candidates the script detected but could not parse
- `raw/dom-data.json`
  - breadcrumbs, definition-list details, DOM photo candidates, and seller avatar data
- `raw/download-log.json`
  - which assets were saved and which failed
- `raw/page.html`
  - full HTML snapshot of the current page at archive time
- `raw/context.json`
  - user agent, archive timestamp, URL, and script snapshot version

## How data is collected

The script combines multiple sources because Vinted can change page structure over time:

1. **Structured data**
   - JSON-LD blocks
   - JSON script payloads used by the page
2. **Meta tags**
   - Open Graph and related metadata
3. **Visible DOM**
   - titles
   - prices
   - seller links
   - breadcrumbs
   - definition lists
   - tables
   - large item images
4. **Raw page snapshot**
   - the full HTML page is saved even when some fields cannot be normalized cleanly

This layered approach is intentional: even if one extraction path breaks, the ZIP should still contain raw material that can be inspected later.

## Why the archive is a ZIP

The ZIP format keeps all listing assets together in one file:

- metadata
- human-readable summary
- photos
- seller avatar
- raw page snapshot
- raw structured data

That makes the archive easier to store, share, inspect, and script against later.

## Coverage

The userscript is configured for Vinted domains through wildcard matches:

- `https://www.vinted.*/*`
- `https://*.vinted.*/*`

The UI only appears on pages whose path looks like a Vinted item page:

- `/items/<numeric id>`

## Button behavior

- The script shows a floating panel in the bottom-right corner.
- The panel is hidden on non-item pages.
- The title line updates to the detected item title.
- Clicking the button starts the archive process.
- Status text reports progress such as:
  - preparing archive
  - downloading photos
  - downloading seller avatar
  - generating ZIP
  - success or failure

## Dependency

The script uses **JSZip 3.10.1** through `@require` to build the ZIP file in the browser.

This keeps the implementation straightforward and avoids reinventing ZIP generation logic inside the userscript.

## Limitations

### 1. The script can only save what the page exposes

If a field is not present in:

- the rendered DOM
- page meta tags
- structured data
- JSON payloads

then the script cannot reliably archive it.

### 2. Vinted may change its frontend at any time

This repository uses DOM and structured-data extraction because userscripts operate against live site markup. If Vinted changes:

- selector names
- DOM structure
- JSON schema
- image hosting layout

some normalized fields may become empty until the script is updated.

### 3. Photo downloads can fail independently

Possible reasons:

- photo CDN changes
- permission restrictions from the userscript manager
- temporary network failures
- rate limits
- blocked cross-origin requests

When that happens, the ZIP still includes metadata and a failure log.

### 4. Not every page script block is guaranteed to be parseable JSON

Some script blocks may contain JavaScript assignments or non-JSON payloads. The userscript records parse failures separately, but it does not attempt unsafe evaluation of arbitrary page scripts.

This is deliberate for safety.

### 5. Seller information may be partial

The script tries to capture:

- seller username
- seller id
- seller profile URL
- seller avatar

but some of these may be missing if the current page does not expose them clearly.

### 6. Counts and timestamps depend on locale and page state

Values such as:

- price text
- favorites
- views
- upload date

may appear in localized formats or may not be present for every visitor, region, or experiment bucket.

### 7. The archive is a point-in-time snapshot

The ZIP reflects the page exactly when the button is pressed. If the seller edits the listing later, the archive will not update automatically.

### 8. Private or hidden data is out of scope

The userscript does **not** bypass permissions, authentication rules, or hidden APIs. It only archives data available to the currently loaded page in the browser.

## Validation performed

The repository does not use a central build system for userscripts. Validation for this addition follows the existing repository pattern:

- syntax-check the script with `node --check "/absolute/path/to/script"`
- from the repository root, the concrete example is `node --check "Vinted Item ZIP Backup"`

## Maintenance notes

If the script stops capturing important fields in the future, the most likely causes are:

- changed Vinted selectors
- changed JSON field names
- changed image URLs
- changed item-page routing

The raw files included in the ZIP should help diagnose those breakages because they preserve the page snapshot and the parseable structured data that was available at archive time.
