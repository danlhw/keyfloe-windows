# Setting up the build CI

The Windows installer is built on a `windows-latest` GitHub Actions
runner since electron-builder's NSIS target only runs natively on
Windows (Wine cross-compilation from macOS is unreliable for the
NSIS bits).

The workflow file is **not** committed in this initial push because
the OAuth token used to push lacked the `workflow` scope. Copy this
file into `.github/workflows/build.yml` once you have push-with-
workflow rights (either by re-authenticating with the `workflow`
scope or by creating it through the GitHub web UI):

```yaml
name: Build Windows installer

on:
  push:
    branches: [main]
    tags: ['v*']
  workflow_dispatch:

jobs:
  build:
    runs-on: windows-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run build
      - run: npm run package
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/upload-artifact@v4
        with:
          name: keyfloe-windows-setup
          path: release/*.exe
      - uses: softprops/action-gh-release@v2
        if: startsWith(github.ref, 'refs/tags/v')
        with:
          files: release/*.exe
```

Tag a release (`git tag v0.1.0 && git push --tags`) to attach the
NSIS .exe to a GitHub Release automatically.
