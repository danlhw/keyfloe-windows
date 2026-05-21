# Keyfloe — Windows

Windows desktop app for [Keyfloe](https://keyfloe.com). A floating AI
companion that listens, sees what's on screen, and helps without
interrupting your flow.

Built on [Tauri](https://tauri.app) (Rust + WebView2) for a small,
fast native binary. Frontend in React + TypeScript.

## Develop

```bash
npm install
npm run tauri dev      # hot-reload dev shell
npm run tauri build    # produces release binary
```

## Build for Windows from macOS

We cross-compile with [`cargo-xwin`](https://github.com/rust-cross/cargo-xwin):

```bash
brew install llvm                                     # provides llvm-lib
cargo install cargo-xwin --locked
rustup target add x86_64-pc-windows-msvc
XWIN_ACCEPT_LICENSE=1 npx tauri build \
  --target x86_64-pc-windows-msvc \
  --runner cargo-xwin
```

Output: `src-tauri/target/x86_64-pc-windows-msvc/release/keyfloe.exe`.

The NSIS installer step (`makensis`) is Windows-only, so the cross-compile
produces a portable `.exe` rather than a wrapped installer. Users
double-click the binary to run it.

## License & Attribution

GPL-3.0 — see [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE). This
project is a fork of an upstream open-source assistant. Original
attribution and our modifications are recorded in `NOTICE`.
