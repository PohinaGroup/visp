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
