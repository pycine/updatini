# Contributing to Updatini

Thanks for taking the time to improve Updatini. This document covers the local setup, the project conventions, and what a good pull request looks like.

## Development setup

Requirements: Node.js 22.12+, npm, a Cloudflare account, and Wrangler.

```bash
git clone https://github.com/pycine/updatini.git
cd updatini
npm install
npx wrangler login
```

For local-only development you do not need to touch production resources:

```bash
npm run token:local     # writes ADMIN_TOKEN to .dev.vars
npm run db:init:local   # creates the bundles table in local D1
npm run dev             # http://localhost:8787
```

If the upload flow does not work locally, check that the local D1 table exists and that `.dev.vars` contains `ADMIN_TOKEN`. Wrangler emulates R2 and D1 under `.wrangler/state`.

## Project layout

| Path | Purpose |
| --- | --- |
| `public/index.html` | Semantic page structure and SVG icon sprite |
| `public/styles.css` | Design tokens, layout, responsive rules, animations |
| `public/app.js` | API client, upload state machine, history/search, auth, toasts |
| `src/worker.js` | Worker API: multipart upload and release listing |
| `schema.sql` | D1 schema |
| `scripts/` | Token generation and deployment helpers |
| `wrangler.toml` | Worker, assets, R2 and D1 bindings |

## Conventions

- **No frontend framework and no build step.** Keep `public/` runnable as static files. Do not add a bundler or a runtime dependency for the UI.
- **Keep the API small and documented.** If you change a route or payload, update the API section of `README.md` and keep the existing upload flow working.
- **Design tokens live in `:root`** in `styles.css`. Reuse them instead of hardcoding colors or spacing.
- **Respect reduced motion.** Any new animation should have a sensible `prefers-reduced-motion` behaviour.
- **Accessibility matters.** Keep labels, focus states, keyboard shortcuts, and ARIA live regions working. The drop zone, search field, progress bar, and token field are all keyboard accessible.
- **No secrets in the repository.** Use `npm run token:local` and `.dev.vars`; both are ignored by Git.
- **Keep scripts cross-platform.** The maintenance scripts are Node.js (`.mjs`) on purpose; avoid bash-only requirements for the public scripts.

## Before opening a pull request

```bash
npm run check          # syntax-check the Worker and browser app
npm run deploy:dry     # bundle with Wrangler without deploying
```

If you changed the upload flow, verify it end-to-end against a local or test Worker:

1. Start `npm run dev`.
2. Open `http://localhost:8787`, connect with the local token.
3. Upload a small `.raucb` file to the whole fleet.
4. Upload a second file to a single board ID.
5. Check that the new releases appear in the history and that search filters them.
6. Test the failure path (for example, stop the Worker mid-upload) and confirm the error state is readable.

If you changed the UI, include a before/after screenshot in the pull request and check desktop plus a narrow viewport (around 390 px wide).

## Pull requests

- Keep the change focused; one concern per pull request.
- Explain *why* the change is needed, not only what changed.
- Mention any manual verification you performed.
- Do not bump the project version or edit `CHANGELOG` (there is none) unless asked.

## Security

Please do not report exploitable security issues in public issues. See [SECURITY.md](SECURITY.md) for the private reporting process.

## License

By contributing, you agree that your contributions are licensed under the project's [MIT license](LICENSE).
