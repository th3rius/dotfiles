---
name: solution
description: Use when testing the solution app (or an MFE hosted in it, like gc) in the local browser and a login is needed — including the Google SSO popup that lives outside the Claude extension's tab group.
---

# solution

## Autonomous login (Google SSO, internal namespaces)

Internal namespaces accept Google login: type `@<subscriber-uid>` (e.g. `@fou`) as the username, **no password**, click "Entrar", and pick the @clinicorp.com account in the popup. The popup is a separate Chromium window the Claude extension cannot reach; handle it with peekaboo + macos-automator (Screen Recording and Accessibility TCC are granted to Ghostty since 2026-09-08).

Sessions are in-memory: any hard reload of the host tab drops the login. Just log in again.

### Steps

1. **Form** (Claude extension, main tab): navigate to `http://localhost:4000`, click the "Usuário" field, type `@fou`, click "Entrar". Button shows "Carregando…" while the popup is open.
2. **Find the popup**: `peekaboo list` windows of app `Chromium` — the popup is the window with width < 600 (title "Fazer login nas Contas do Google"). Screenshot it with `peekaboo image` (`capture_focus: background`) to confirm it shows the account chooser.
3. **Focus the account link** (System Events, AppleScript):

```applescript
tell application "System Events"
  tell process "Chromium"
    -- popupWin = first window with width < 600
    perform action "AXRaise" of popupWin
    -- in `entire contents of popupWin`, find role "AXLink"
    -- whose description contains "gabriel.oliveira@clinicorp.com"
    set focused of theLink to true
  end tell
end tell
```

4. **Activate with Return posted to Chromium's PID** (JXA — no global input, cursor never moves):

```javascript
ObjC.import('CoreGraphics');
const pid = Application('System Events').processes.byName('Chromium').unixId();
$.CGEventPostToPid(pid, $.CGEventCreateKeyboardEvent($.nil, 36, true));
delay(0.06);
$.CGEventPostToPid(pid, $.CGEventCreateKeyboardEvent($.nil, 36, false));
```

5. **Verify**: within ~10s the popup window disappears and the main tab lands on `http://localhost:4000/` with title "Clinicorp".

## Local stack (hosted-mode testing: solution host + gc remote)

| Service | Where | Command |
|---|---|---|
| Postgres (dev `solution` DB) | :5432 | `cloud-sql-proxy --port 5432 dev-clinicorp:us-east1:solution` (needs gcloud ADC) |
| gc-api | :4444 | `~/Projects/gc/apps/server`: `SECURITY_API_URL=https://dev.api.clinicorp.com/security/ pnpm dev` (override skips running security locally; its JWKS endpoint answers) |
| gc web | :5801 | `~/Projects/gc/apps/web`: `npx vite build && npx vite preview --port 5801` — **build+preview, not `vite dev`** (Module Federation breaks in dev mode) |
| solution server | :8080 | `~/Projects/dev/server`: `npm run start:dev` |
| solution client | :4000 | `~/Projects/dev/client`: `GC_MFE_URL=http://localhost:5801 npm run dev` (points the calendar remote at the local gc build; client proxies `/api` → :8080) |

**Env footguns** (`~/Projects/gc/apps/web`):
- `.env.local` **overrides** `.env` in vite. For hosted mode, `VITE_SOLUTION_API_URL=http://localhost:4000/api` must win — if it points at the dev cloud gateway, requests are silently CORS-blocked and the professionals sidebar comes up empty (`business/list` fails → `business` null → the professionals query is `enabled: false` and never fires).
- Standalone harness (no solution host) needs `.env` copied from `.env.example` (`MFE_STANDALONE=true` + `SECURITY_MFE_URL`).
- `vite build` dying with the `proxyRemoteEntry` error also happens when node_modules is stale vs the lockfile — run `pnpm install` first.

### Pitfalls (all hit in practice)

| Attempt | Why it fails |
|---|---|
| `AXPress` on the account `AXLink` | Returns success but Google's chooser ignores synthetic AX activation — page doesn't move |
| `AXPress` matched by email text | Matches the `AXStaticText`, whose press is a no-op; always filter `role is "AXLink"` |
| HID-tap `CGEventCreateMouseEvent` click | Works but steals the cursor, and coordinates are layout-fragile — the "Claude está depurando" banner shifts rows ~56px and nearly selects the wrong Google account |
| Extension `read_network_requests` for verification | Misses the MFE's XHRs; verify server-side (solution server request log, or `pg_stat_activity` — each pool connection retains its last query even when idle) |
