# App icon

electron-builder reads icons from this `build/` folder (it's the configured
`directories.buildResources`). To set the Zirtola desktop / taskbar / installer
icon:

1. Save the app icon here as **`build/icon.png`**.
   - Square, **1024×1024** (minimum 512×512), 32-bit PNG with transparency.
2. That's it — on the next release electron-builder automatically generates the
   Windows `.ico` and macOS `.icns` from this PNG and embeds them in the app, so
   the **desktop shortcut, taskbar, and installer** all use it. No code changes
   needed.

Optional (only if you want to pin exact formats):
- `build/icon.ico` (Windows, 256×256) and `build/icon.icns` (macOS) can be
  provided instead of / in addition to the PNG.

After adding `build/icon.png`, bump the version and push to `main` to publish a
release that includes the new icon.
