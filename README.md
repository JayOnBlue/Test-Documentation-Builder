# sf-docs-automation-demo

A small, runnable, end-to-end example of the pipeline described in the architecture memo: push
Salesforce metadata changes to `main`, and get back an always-current **Changelog**, **Business /
Use-Case Documentation**, and **Technical Reference** — all Markdown/JSON-driven, all published as
**one** GitHub Pages site with a single light visual language. UI/UX follows the high-fidelity handoff
in `design_handoff_qe360_docs/` (see `PAGE_FEATURES.md` and `DESIGN_TOKENS.md` there for the full spec
this was built against). No screenshots/image capture in this version (dropped by request — everything
here is text/Markdown/JSON).

This folder is fully self-contained and does not touch anything outside itself. Copy it into its own
GitHub repository (or push it as-is — see below) to try it.

## Layout

Everything lives under `docs/`, except the one workflow file GitHub requires at `.github/workflows/`:

```
sf-docs-automation-demo/
├── force-app/                          # a small dummy Salesforce project (Order Management)
├── docs/
│   ├── scripts/                        # all pipeline code
│   │   ├── lib/discover.js             # what counts as a "component" in force-app
│   │   ├── lib/util.js                 # git-derived "last updated" + read-time helpers
│   │   ├── extract-technical.js        # deterministic: force-app -> docs/technical/data.json
│   │   ├── generate-version-history.js # deterministic: git log -> docs/technical/versions.json
│   │   ├── generate-changelog.js       # deterministic: force-app diff -> docs/CHANGELOG.md (grouped releases)
│   │   ├── author-business-docs.mjs    # the ONE AI step -> updates docs/business/*.md only
│   │   ├── build-site.js               # assembles docs/site/ (one shell + one data bundle)
│   │   └── site-assets/                # index.html / app.js / styles.css — the unified SPA shell
│   ├── business/                       # <- the business/use-case Markdown "database"
│   │   ├── TEMPLATE.md
│   │   ├── getting-started/overview.md
│   │   └── orders/*.md                 # Order Lifecycle + Order Adjustments (real), Group Orders (stub), Fulfillment Orders (deprecated demo)
│   ├── technical/data.json             # generated — do not hand-edit
│   ├── technical/versions.json         # generated — do not hand-edit
│   ├── CHANGELOG.md                    # generated — do not hand-edit (the release data IS this file)
│   ├── _state/progress.json            # generated — tracks the last commit this pipeline documented
│   └── site/                           # generated — the GitHub Pages output; git-ignored, rebuilt every run
└── .github/workflows/docs-pipeline.yml # the only file outside docs/
```

`docs/site/` is listed in `.gitignore` — it's pure build output (derived entirely from `docs/business/`,
`docs/technical/*.json`, and `docs/CHANGELOG.md`), so it's rebuilt fresh by CI and uploaded straight to
Pages rather than committed. Everything else under `docs/` (the Markdown, the JSON graph, the changelog,
the state pointer) **is** committed — that's the actual "database."

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
| `/tech/versions` | Version History | GitHub-commit style timeline, generated from real `git log` on `force-app/` |
| Download modal | — | Scope (All / Technical / a category) + PDF (print view) or Word (`.doc`) |

## What's real here vs. simplified

- **Coverage / health / AI Review are a static heuristic, not a real Apex test run.** A class counts as
  "covered" if some `*Test` class in the repo references it (via a `calls_method`/`constructs` edge) —
  there's no org connection, so this can't know what actually ran in a test execution. It's labeled as a
  heuristic everywhere it's shown.
- **Security findings** (the "Security" note under AI Review) are a simple rule: a class doing SOQL or
  DML gets a static FLS/CRUD reminder. It's pattern-matching, not a real security scanner.
- **Features** are connected components of the dependency graph, not curated. With this demo's small
  `Order__c` domain everything is one connected cluster ("Order Management") — a real org's less-connected
  graph naturally produces more, smaller features.
- **The technical extractor** (`extract-technical.js`) is a small, from-scratch reimplementation — regex
  static analysis, not the nuance of a production-grade version (no case-insensitive Apex resolution,
  simpler comment stripping, etc.). Enough to show real dependency edges on the sample domain, not enough
  to trust blindly on a large, messy org.
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
