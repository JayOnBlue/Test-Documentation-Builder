# sf-docs-automation-demo

A small, runnable, end-to-end example of the pipeline described in the architecture memo: push
Salesforce metadata changes to `main`, and get back an always-current **Changelog**, **Business /
Use-Case Documentation**, and **Technical Documentation** — all Markdown-driven, all published as one
GitHub Pages site. No screenshots/image capture in this version (dropped by request — everything here
is text/Markdown).

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
│   │   ├── extract-technical.js        # deterministic: force-app -> docs/technical/data.json
│   │   ├── generate-changelog.js       # deterministic: force-app diff -> docs/CHANGELOG.md
│   │   ├── author-business-docs.mjs    # the ONE AI step -> updates docs/business/*.md only
│   │   ├── build-site.js               # renders business + technical + changelog -> docs/site/
│   │   ├── business-assets/            # styles.css / app.js for the business-docs site (Stripe-style)
│   │   └── technical-assets/           # index.html / app.js / styles.css for the technical wiki (dark theme)
│   ├── business/                       # <- the business/use-case Markdown "database" (edit these by hand, or let the AI step do it)
│   │   ├── TEMPLATE.md
│   │   ├── getting-started/overview.md
│   │   └── orders/order-lifecycle.md
│   ├── technical/data.json             # generated — do not hand-edit
│   ├── CHANGELOG.md                    # generated — do not hand-edit
│   ├── _state/progress.json            # generated — tracks the last commit this pipeline documented
│   └── site/                           # generated — the GitHub Pages output; git-ignored, rebuilt every run
└── .github/workflows/docs-pipeline.yml # the only file outside docs/
```

`docs/site/` is listed in `.gitignore` — it's pure build output (derived entirely from `docs/business/`,
`docs/technical/data.json`, and `docs/CHANGELOG.md`), so it's rebuilt fresh by CI and uploaded straight to
Pages rather than committed. Everything else under `docs/` (the Markdown, the JSON graph, the changelog,
the state pointer) **is** committed — that's the actual "database."

## What's real here vs. simplified

- The **technical extractor** (`extract-technical.js`) is a small, from-scratch reimplementation of the
  idea — regex-based static analysis over Apex/Flow/LWC/object metadata, same philosophy as a
  production-grade version of this, just far less nuanced (no comment-stripping edge cases, no
  case-insensitive Apex resolution, etc.). It's enough to show real dependency edges on the sample
  `Order__c` domain, not enough to trust on a large, messy org without hardening.
- The **business-docs site** (Stripe-style layout: top tabs, per-category sidebar, on-this-page outline,
  search, "Copy for LLM" / "Download PDF" actions) is adapted directly from `client-business-docs-source-V2`'s
  generator, with the screenshot-placeholder feature removed and the changelog switched from "fetched from
  GitHub Releases" to "parsed from `docs/CHANGELOG.md`".
- The **technical wiki** (dark theme, source tree, component detail pages with Depends-on/Used-by/Impact)
  is a new, smaller client-side app built to look like the screenshot you shared, backed by
  `docs/technical/data.json` instead of a live backend — there's no `Rebuild` button because there's no
  server; regeneration only happens through the pipeline.
- The **AI business-doc step** is new. It's the only place in this pipeline that writes prose rather than
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

This second push is where you'll see: a new dated entry in the Changelog, a pull request proposing
business-doc updates (if `CLAUDE_CODE_OAUTH_TOKEN` is set), and the technical docs refreshed — all
before the site redeploys.

## Run it locally without GitHub Actions

```bash
npm install
npm run build          # extract technical docs -> author business docs (skips gracefully without
                        # git history or a Claude CLI/token) -> changelog -> build the site
```

Then open `docs/site/index.html` directly in a browser (business docs) and `docs/site/technical/index.html`
(technical wiki) — both are fully static, no server needed. Re-run `npm run build` any time you change
something under `force-app/`.

Individual steps, if you want to run just one:

```bash
node docs/scripts/extract-technical.js       # force-app -> docs/technical/data.json
node docs/scripts/author-business-docs.mjs   # needs git history + CLAUDE_CODE_OAUTH_TOKEN + claude CLI
node docs/scripts/generate-changelog.js      # force-app diff -> docs/CHANGELOG.md
node docs/scripts/build-site.js              # docs/business + docs/technical + docs/CHANGELOG.md -> docs/site
```

## Why the business-doc step is scoped so tightly

`author-business-docs.mjs` runs Claude with `--allowedTools "Read,Write,Edit"` (no `Bash`) and an explicit
instruction to only touch `docs/business/`. The workflow adds a second, independent safety net: after the
CLI call, anything changed outside `docs/business/` gets reverted before a commit or PR is ever created.
The changes it does make land in a pull request, not a direct commit to `main` — this is the one layer of
the pipeline where an LLM is writing something a person might read, so it gets a human glance first.
Everything else (technical docs, changelog) is deterministic and commits straight to `main`, the same way
`deploy-webapp.yml` already does in the main project this was modeled on.
