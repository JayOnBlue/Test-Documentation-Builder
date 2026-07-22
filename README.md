# sf-docs-automation-demo

A small, runnable, end-to-end example of the pipeline described in the architecture memo: push
Salesforce metadata changes to `main`, and get back an always-current **Changelog**, **Business /
Use-Case Documentation**, and **Technical Reference** — all Markdown/JSON-driven, all published as
**one** GitHub Pages site with a single light visual language. UI/UX follows the high-fidelity handoff
in `design_handoff_qe360_docs/` (see `PAGE_FEATURES.md` and `DESIGN_TOKENS.md` there for the full spec
this was built against). Business docs can also include `screenshot` blocks (see `docs/business/TEMPLATE.md`)
that render as real images once captured — see **Screenshot capture** below.

This folder is fully self-contained and does not touch anything outside itself. Copy it into its own
GitHub repository (or push it as-is — see below) to try it.

## Layout

```
sf-docs-automation-demo/
├── force-app/                          # a dummy Salesforce project — 6 business domains, ~190 files
│   └── main/default/{tabs,applications,permissionsets}/  # Order__c tab/app + the docs-capture permission set
├── docs/
│   ├── scripts/                        # all pipeline code
│   │   ├── lib/discover.js             # what counts as a "component" in force-app
│   │   ├── lib/util.js                 # git-derived "last updated" + read-time helpers
│   │   ├── extract-technical.js        # deterministic: force-app -> docs/technical/data.json
│   │   ├── generate-version-history.js # deterministic: git log -> docs/technical/versions.json
│   │   ├── generate-changelog.js       # deterministic: force-app diff -> docs/CHANGELOG.md (grouped releases)
│   │   ├── author-business-docs.mjs    # the ONE AI step -> updates docs/business/*.md only
│   │   ├── build-site.js               # assembles docs/site/ (one shell + one data bundle) + docs/screenshot-manifest.json
│   │   └── site-assets/                # index.html / app.js / styles.css — the unified SPA shell
│   ├── business/                       # <- the business/use-case Markdown "database"
│   │   ├── TEMPLATE.md                 # documents the `callout` and `screenshot` fenced-block conventions
│   │   ├── getting-started/overview.md
│   │   └── orders/*.md                 # Order Lifecycle (has screenshot blocks) + Order Adjustments (real), Group Orders (stub), Fulfillment Orders (deprecated demo)
│   ├── technical/data.json             # generated — do not hand-edit
│   ├── technical/versions.json         # generated — do not hand-edit
│   ├── CHANGELOG.md                    # generated — do not hand-edit (the release data IS this file)
│   ├── screenshot-manifest.json        # generated — every `screenshot` block found across docs/business/**/*.md
│   ├── images/                         # captured screenshots (<screenshot-id>.png), committed by the workflow below
│   ├── _state/progress.json            # generated — tracks the last commit this pipeline documented
│   └── site/                           # generated — the GitHub Pages output; git-ignored, rebuilt every run
├── robot-capture/                      # CumulusCI + Robot Framework (SalesforcePlaywright) screenshot capture — see its own README
└── .github/workflows/
    ├── docs-pipeline.yml               # force-app push -> Changelog/Business docs/Technical Reference -> GitHub Pages
    └── capture-screenshots.yml         # manual trigger -> runs robot-capture/, commits new docs/images
```

`docs/site/` is listed in `.gitignore` — it's pure build output (derived entirely from `docs/business/`,
`docs/technical/*.json`, and `docs/CHANGELOG.md`), so it's rebuilt fresh by CI and uploaded straight to
Pages rather than committed. Everything else under `docs/` (the Markdown, the JSON graph, the changelog,
the state pointer, the screenshot manifest, the captured images) **is** committed — that's the actual
"database."

## One shell, two modes

The whole site is a single client-side app (`site-assets/app.js`, hash-routed so every page is still a
real, shareable/bookmarkable URL — e.g. `#/tech/class/OrderService`). One top bar, one visual language;
the left sidebar swaps content depending on whether you're in **business mode** (`/`, `/docs/*`,
`/changelog`) or **technical mode** (`/tech/*`), exactly as specified in the design handoff's IA table.

Pages implemented:

| Route | Page | Notable behavior |
|---|---|---|
| `/` | Overview | Role picker (Sales/Operations/Developer/Everyone) filters the sidebar; key-terms glossary; "Browse by area" cards |
| `/docs/:section/:page` | Business article | Collapsible `## ` sections, callout blocks (before/note/tip/warning), deprecation banner, Related chips, Prev/Next |
| `/changelog` | Changelog | GitHub-Releases style: tag pill, Latest badge, grouped Added/Changed/Removed, contributor avatars, compare link |
| `/tech` | Technical Overview | Stat cards + Components-by-type / Edges-by-relationship tables |
| `/tech/index` | Component Index | Text filter, health chips (All/Needs attention/Healthy), sort (Name/Risk), coverage bar |
| `/tech/class/:name` | Apex class detail | Purpose (saved to `localStorage`), AI Review (deterministic heuristic, see below), expandable Methods w/ used-in, Depends-on/Used-by, Impact blast-radius panel |
| `/tech/object/:name` | Custom object schema | Fields table, Record Types, Relationships |
| `/tech/features` | Features | Auto-clustered from the dependency graph (connected components) |
| `/tech/versions` | Version History | GitHub-commit style timeline from real `git log`; each commit also gets a derived **Technical** summary (what kinds of components changed) and **Business** summary (which Feature — from the dependency-graph clusters — those components belong to) |
| Download modal | — | Scope (All / Technical / a category) + PDF (print view) or Word (`.doc`) |

## What's real here vs. simplified

- **Coverage / health / AI Review are a static heuristic, not a real Apex test run.** A class counts as
  "covered" if some `*Test` class in the repo references it (via a `calls_method`/`constructs` edge) —
  there's no org connection, so this can't know what actually ran in a test execution. It's labeled as a
  heuristic everywhere it's shown.
- **Security findings** (the "Security" note under AI Review) are a simple rule: a class doing SOQL or
  DML gets a static FLS/CRUD reminder. It's pattern-matching, not a real security scanner.
- **Features** are connected components of the dependency graph, not curated. `force-app` has six business
  domains (Order Management, Inventory, Customer Support, Marketing Campaigns, Billing & Invoicing, Partner
  Management) — most stay separate clusters, but a deliberate cross-cutting service
  (`CrossModuleReconciliation...ServiceImplementation`) bridges two of them into one, which is realistic:
  shared/reconciliation services really do merge otherwise-unrelated features in a real org's graph.
- **The technical extractor** (`extract-technical.js`) is a small, from-scratch reimplementation — regex
  static analysis, not the nuance of a production-grade version (no case-insensitive Apex resolution, no
  awareness of dynamic SOQL, etc.). It does strip both comments and string-literal contents before scanning
  (so a class name or "FROM Object" mentioned in a log message or old commented-out code isn't mistaken for
  a real reference — see `LegacyCommentTrapService` in `force-app` for the regression case that caught this).
- **Deliberate edge cases live in `force-app`** to exercise the pipeline honestly rather than just look busy:
  a fully orphaned class (`DeprecatedLegacyHelper`, zero dependents/dependencies), an empty test class
  (`EmptyPlaceholderTest`), a 40-method class (`BulkDataProcessingUtility`, throughput check), a Flow with no
  associated object, a Lightning component with no Apex import at all, two triggers on one object
  (`Product__c`), an intentionally very long class name (word-wrap check), Record Types on `Invoice__c`, and
  a multiselect picklist + an explicitly-required non-master-detail field.
- **The AI business-doc step** is the only place in this pipeline that writes prose rather than
  extracting facts.

## One-time setup, after pushing this to its own GitHub repo

1. **Settings → Pages → Build and deployment → Source → "GitHub Actions."**
2. **Settings → Actions → General → Workflow permissions** → select "Read and write permissions", and
   check **"Allow GitHub Actions to create and approve pull requests."** (Needed so the pipeline can open
   a PR for the AI-authored business docs, and push its own commits back to `main`.)
3. **Generate a Claude Code OAuth token** (uses your Claude Pro/Max/Team/Enterprise subscription — not
   per-token API billing):
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude setup-token
   ```
   This opens a browser to authorize, then prints a token. Add it as a repo secret named
   **`CLAUDE_CODE_OAUTH_TOKEN`** (Settings → Secrets and variables → Actions → New repository secret).
   If you skip this, the pipeline still runs and deploys — it just skips the AI business-doc step and
   tells you so in the log.
4. **(Optional) Enable screenshot capture** — `capture-screenshots.yml` is a separate, manually-triggered
   workflow (Actions tab → "Capture Documentation Screenshots" → Run workflow). One-time setup:
   ```bash
   sf org display --verbose --json --target-org <your-already-logged-in-org>   # copy the "sfdxAuthUrl" value
   ```
   Add that value as a repo secret named **`SF_AUTH_URL`**. This is a refresh-token URL derived from a
   session you already satisfied MFA/passkey on — the workflow reuses it silently on every run, so no
   login screen or MFA/passkey prompt ever appears in CI. See `robot-capture/README.md` for what it
   captures and how to run it locally first.

## Try it

```bash
git init                      # if this folder isn't already a git repo
git add -A
git commit -m "initial commit"
git branch -M main
git remote add origin <your-new-empty-repo-url>
git push -u origin main
```

That first push runs the pipeline, does a full baseline sweep (no AI step yet — nothing to diff against
on the very first commit), and deploys the site. Then make a real change to see the incremental behavior:

```bash
# e.g. add a field, tweak OrderService.cls, whatever
git add force-app
git commit -m "tweak order handling"
git push
```

This second push is where you'll see: a new release entry in the Changelog, a new commit in Version
History, a pull request proposing business-doc updates (if `CLAUDE_CODE_OAUTH_TOKEN` is set), and the
technical docs refreshed — all before the site redeploys.

## Run it locally without GitHub Actions

```bash
npm install
npm run build          # extract technical docs -> author business docs (skips gracefully without git
                        # history or a Claude CLI/token) -> version history -> changelog -> build the site
```

Then open `docs/site/index.html` directly in a browser — it's fully static, no server needed. Every page
(business docs, changelog, technical reference, component detail, version history) is one app; navigate
with the top bar and sidebar, or jump straight to a URL like `docs/site/index.html#/tech/index`. Re-run
`npm run build` any time you change something under `force-app/` or `docs/business/`.

Individual steps, if you want to run just one:

```bash
node docs/scripts/extract-technical.js       # force-app -> docs/technical/data.json
node docs/scripts/author-business-docs.mjs   # needs git history + CLAUDE_CODE_OAUTH_TOKEN + claude CLI
node docs/scripts/generate-version-history.js# git log -> docs/technical/versions.json
node docs/scripts/generate-changelog.js      # force-app diff -> docs/CHANGELOG.md
node docs/scripts/build-site.js              # docs/business + docs/technical/*.json + docs/CHANGELOG.md -> docs/site
```

## Why the business-doc step is scoped so tightly

`author-business-docs.mjs` runs Claude with `--allowedTools "Read,Write,Edit"` (no `Bash`) and an explicit
instruction to only touch `docs/business/`. The workflow adds a second, independent safety net: after the
CLI call, anything changed outside `docs/business/` gets reverted before a commit or PR is ever created.
The changes it does make land in a pull request, not a direct commit to `main` — this is the one layer of
the pipeline where an LLM is writing something a person might read, so it gets a human glance first.
Everything else (technical docs, version history, changelog) is deterministic and commits straight to
`main`, the same way `deploy-webapp.yml` already does in the main project this was modeled on.

## How the AI step scales to a large changeset

The naive version of this script would build one giant prompt with the full `git diff` inlined and hope
it fits — on a real org that either blows past context limits or, worse, gets silently truncated at some
fixed character count, quietly dropping real changes. Instead:

1. Changed files are never diffed into the prompt. Each prompt gets a **manifest** (path, change type,
   component name) and Claude reads the actual current file content itself with its own `Read` tool —
   bounded per file no matter how large the underlying diff is.
2. Changed components are grouped by **feature** (the same connected-component clusters
   `docs/technical/data.json` computes for the Features page) and processed one feature at a time, each
   as its own `claude` call with its own bounded context. A repo-wide change touching many unrelated
   features becomes N focused calls instead of one call trying to reason about everything — more accurate
   per call, and it scales to any diff size since the call count grows with the change, not a fixed prompt
   budget.
3. Within one feature, if the changed-file count still exceeds `MAX_FILES_PER_BATCH` (120), it's chunked
   further so no single call is ever handed an unbounded list. Every changed file is covered by exactly
   one batch — nothing is dropped for being "too much," which is the actual point of the "handle a huge
   changeset without missing details" requirement this was built against.

A typical single-commit tweak here still only touches one feature at a time, so you'll usually see "1
batch" in the log for any given push — but with six domains and 120+ components now in `force-app`, a
change that touches several domains at once (edit one file in Orders, one in Billing, one in Inventory)
will visibly fan out into multiple feature groups and log a batch count > 1, which is the mechanism this
was built to demonstrate.
