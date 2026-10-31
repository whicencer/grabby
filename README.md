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
pnpm run tauri dev     # run in dev mode
pnpm run tauri build   # release build
```

## License

Copyright (C) 2026 whicencer

Licensed under the [GNU General Public License v3.0 or later](LICENSE).
