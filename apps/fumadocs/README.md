# VISP documentation app

Fumadocs 16 on TanStack Start serves the broadcaster and operator guides from
`content/docs`.

See the repository [development guide](../../DEVELOPMENT.md) for the complete
workspace setup. Add pages under `content/docs` and register their slugs in the
adjacent `meta.json`.

```bash
bun install
bun run --cwd apps/fumadocs dev
```

Development runs on <http://localhost:4000>. Build and preview with:

```bash
bun run --cwd apps/fumadocs build
bun run --cwd apps/fumadocs preview
```

The production build prerenders documentation pages, static search, Markdown
and LLM text outputs into `.output/public`. Vite deduplicates React and maps the
legacy external-store compatibility shim to the same React runtime; keep that
configuration when updating Base UI or Fumadocs because duplicate runtimes can
make prerendering fail without a non-zero build exit.

A stable `vX.Y.Z` GitHub Release verifies the required outputs and deploys this
directory to the app server. Caddy serves it at `https://docs.arvoitus.com`
with `_shell.html` as the fallback. There is no Fumadocs systemd service. Host,
DNS, and GitHub setup are documented in
[`deploy/UPDATE.md`](../../deploy/UPDATE.md).
