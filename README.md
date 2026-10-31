# Grabby

Desktop app for downloading video and audio, powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp).

> Work in progress.

## Stack

- [Tauri 2](https://tauri.app/) (Rust) + React 19 + TypeScript + Vite
- yt-dlp, ffmpeg, Deno as bundled helpers

Platforms: macOS (Intel + Apple Silicon), Windows.

## Development

Requirements: Node.js, pnpm, Rust ([Tauri prerequisites](https://tauri.app/start/prerequisites/)).

```sh
pnpm install
pnpm helpers           # once: downloads yt-dlp and Deno, builds ffmpeg (~2 min)
pnpm run tauri dev     # run in dev mode
pnpm tauri:mock        # dev mode without network: fake previews and downloads
pnpm run tauri build   # release build
```

Releases are built by GitHub Actions (`.github/workflows/release.yml`) when a `v*` tag is pushed.

## License

Copyright (C) 2026 whicencer

Licensed under the [GNU General Public License v3.0 or later](LICENSE).
