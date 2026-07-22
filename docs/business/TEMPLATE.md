---
title: "Feature Name (H1 shown at top of page)"
feature: "Short Feature Name"
category: "Orders"          # Groups pages in the sidebar, e.g. Getting Started, Orders
description: "One sentence describing what this feature lets the user do. Shown under the title and in nav/search."
owner: "Ops Enablement"          # Shown in the meta row. Whoever is accountable for this page being correct.
verified: true                   # false renders an "Auto-generated" pill instead of "Verified" (use false for stub/AI-drafted pages)
prerequisites:
  - "Permission set or profile required, e.g. 'Manage Orders' permission"
  - "Any object/field/setting that must already be configured"
related:
  - "feature-name-2"              # slugs of other business pages, rendered as clickable chips
deprecated: false                 # set true (and add replacement) to show a red deprecation banner
replacement: ""                   # slug of the page that replaces this one, if deprecated
order: 10                        # Controls position within the category in the sidebar (lower = higher up)
slug: "feature-name"             # Optional. Defaults to filename if omitted.
---

## Overview

2-4 sentences in plain language: what business problem this feature solves, who uses it, and when it's
triggered. Write for the person reading the doc, not the system. Say what the user can do, not how it's built.

## Prerequisites

List anything that must be true before someone can use this feature. This renders as a callout box.

- Profile / permission set required
- Dependent configuration that must already exist (e.g. a Record Type, a Flow, a Queue)

## Steps to Navigate

Numbered, step-by-step instructions exactly as a user would click through Salesforce.

1. Click the gear icon in the top-right, then click **Setup**.
2. Continue numbering every click, field entry, and selection until the task is complete.

## Validations & Business Rules

Any validation rules, required fields, automation (Flow/Apex trigger), or business logic that affects this
feature. This is what an admin/support person needs to know when something doesn't behave as expected.

- Validation rule: `Field__c` is required when `Status__c = 'Active'`
- Automation: a Flow/Trigger runs on save that does X

## Related Features

- Optional: links or references to adjacent features, written as plain text

<!--
CALLOUT BLOCK CONVENTION
------------------------
Use a fenced code block tagged `callout` anywhere you need a "Before you start" / Note / Tip / Warning box:

```callout
type: tip
Any **markdown** body text goes here, on the lines after `type:`.
```

`type` is one of: before | note | tip | warning. (A `deprecated` banner instead comes from this page's own
frontmatter — see `deprecated`/`replacement` above — not from a callout block.)

SCREENSHOT BLOCK CONVENTION
----------------------------
Use a fenced code block tagged `screenshot` inside "Steps to Navigate" wherever a step needs a picture:

```screenshot
id: feature-name-some-step
alt: Plain-language description of exactly what the screenshot shows
step: The action to perform to reach this screen (what the capture workflow will do)
url_pattern: /lightning/r/Object__c/{recordId}/view
```

- `id` — unique across all docs, kebab-case, prefixed with the page slug (e.g. `order-lifecycle-record-page`).
- `alt` — used as the image's alt text and shown under the placeholder until captured.
- `step` — shown as "Capture: ..." under the placeholder; also read by the capture workflow.
- `url_pattern` — the page to navigate to. Use `{recordId}` for a record page — it's resolved automatically
  via SOQL. Omit or leave generic for a step that needs real clicks (App Launcher, filling a form, etc.);
  give the capture workflow's `robot-capture/` a dedicated test case for those instead (see its README).

`build-site.js` renders a real `<img>` once a matching file exists at `docs/images/<id>.png` (or `.jpg`),
otherwise a dashed "Screenshot pending" placeholder with the `alt`/`step` text. `docs/screenshot-manifest.json`
is generated from every `screenshot` block across all pages — it's the input the capture workflow reads.
-->
