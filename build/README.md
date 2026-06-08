# Build resources

Place launcher icons here for `electron-builder`:

- `icon.ico` — Windows (256x256 multi-resolution, required for NSIS installer)
- `icon.icns` — macOS
- `icon.png` — Linux (512x512 recommended)

If these files are missing, `electron-builder` will use a default Electron icon. To generate them from a single source PNG, use:

```bash
npx electron-icon-maker --input=source.png --output=./build
```
