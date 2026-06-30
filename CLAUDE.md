# Zirtola — project notes for Claude

## Release policy (standing instruction)
After completing any set of code updates and pushing them, **always cut a
release automatically — do not wait to be asked.**

Procedure each time:
1. Bump `"version"` in `package.json` (patch by default; minor for notable
   features).
2. Commit the version bump with the other changes.
3. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. The `.github/workflows/release.yml` workflow builds the Windows (NSIS) and
   macOS (dmg) installers and publishes them to GitHub Releases, which the
   in-app "Check for Updates" pulls from.
5. After tagging, verify the workflow run started (and report failures).

Notes:
- Tags trigger the release workflow from whatever branch they point at, as long
  as `release.yml` exists in that commit — merging to the default branch is NOT
  required to cut a release.
- Never embed a GitHub token in the app. If the source repo goes private later,
  publish installers to a separate PUBLIC releases repo (see docs) using a CI
  secret; nothing secret ships in the app.

## Key facts
- Product name: **Zirtola — The AI Video Game Editor** (internal bridge name
  `window.devpad` is kept as-is).
- Working branch: `claude/devpad-godot-companion-ypwzgx`.
- Verify before pushing: `npx tsc --noEmit` and `npm run build:renderer`.
