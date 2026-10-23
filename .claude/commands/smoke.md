---
description: Run a live smoke test of the Zona app (static checks, then the real app via Expo web)
allowed-tools: Bash, PowerShell, Read, Grep, mcp__plugin_playwright_playwright__*
---

Run a live smoke test of Zona and report pass/fail per step. Stop and report on the first failing step.

1. **Static checks** — run `npx tsc --noEmit`, `npm run lint`, and `npm test`. Report any failures with output.
2. **Start the app** — run `npx expo start --web --port 8081` in the background and wait until the bundler reports it is ready (check the output; do not sleep-poll).
3. **Drive it** — with the Playwright browser tools, navigate to `http://localhost:8081` and:
   - confirm it renders without console errors (`browser_console_messages`);
   - with no session, confirm the sign-in screen shows the three OAuth provider buttons;
   - if `$ARGUMENTS` contains a test account or token, sign in and confirm the Feed tab loads, then visit Messages and Profile via the bottom tab bar.
4. **Network** — check `browser_network_requests` for failed (4xx/5xx) API calls. A 401 before sign-in is expected.
5. **Clean up** — close the browser and stop the dev server.

Finish with a short table: step, result, notes. Do not edit any files.
