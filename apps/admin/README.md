# VISP Admin

Internal support console for VISP accounts, devices, relay usage, and safe
account actions. It uses the main VISP session and API; it never receives relay
credentials, OAuth tokens, session IPs, snapshots, or stream contents.

`bun run dev:local` serves it at <https://admin.visp.localhost>. The signed-in
account must have the `admin` role or be listed in the server's
`ADMIN_USER_IDS`.

```bash
bun run --cwd apps/admin check-types
bun run --cwd apps/admin build
```
