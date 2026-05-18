# build/ — electron-builder assets

These files are referenced by `package.json`'s `build` block. The MVP
ships `icon.svg`; to produce a Windows installer with the real icon you
need a 256×256 `icon.ico` (multi-size) and a small `tray.png` (32×32).

Quick path:

```pwsh
# from the repo root, with imagemagick installed
magick build/icon.svg -background none -resize 256x256 build/icon-256.png
magick build/icon-256.png -define icon:auto-resize=16,24,32,48,64,128,256 build/icon.ico
magick build/icon.svg -background none -resize 32x32 build/tray.png
```

Until `icon.ico` exists, `electron-builder` will fall back to its
default Electron logo on the .exe, but the app still installs and runs.
