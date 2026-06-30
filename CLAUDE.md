# Zirtola — project notes for Claude

## Release policy (standing instruction)
After completing any set of code updates and pushing them, **always cut a
release automatically — do not wait to be asked.**

Procedure each time:
1. Bump `"version"` in `package.json` (patch by default; minor for notable
   features). MUST be unique — electron-builder publishes a release tagged
   `v{version}`, so reusing a version collides.
2. Commit the version bump with the other changes on the working branch.
3. Push the working branch, then push it to `main`:
   `git push origin HEAD:main`.
4. The push to `main` triggers `.github/workflows/release.yml`, which builds the
   Windows (NSIS) and macOS (dmg) installers and publishes them to GitHub
   Releases — the in-app "Check for Updates" pulls from there.
5. Verify the workflow run started (GitHub Actions MCP) and report failures.

Notes:
- We release on **push to `main`**, NOT by pushing tags — this sandbox's git
  proxy rejects tag pushes, so tag-based releases don't work from here.
- `release.yml` still also accepts `v*` tags and manual dispatch for releases
  cut from a normal environment.
- Never embed a GitHub token in the app. If the source repo goes private later,
  publish installers to a separate PUBLIC releases repo (see docs) using a CI
  secret; nothing secret ships in the app.

## Roadmap (future, not yet built)
- **Managed API keys / membership:** move from user-supplied keys to Zirtola's
  own keys gated behind a paid membership (server-side proxy holds the secrets;
  nothing secret ships in the app). Local-key mode stays as a fallback/BYOK.
- **Local models via Ollama:** let users point Zirtola at a local Ollama
  endpoint and route any task slot to a local model (offline / free option).

## Key facts
- Product name: **Zirtola — The AI Video Game Editor** (internal bridge name
  `window.devpad` is kept as-is).
- Working branch: `claude/devpad-godot-companion-ypwzgx`.
- Verify before pushing: `npx tsc --noEmit` and `npm run build:renderer`.
