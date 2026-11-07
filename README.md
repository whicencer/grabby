# Grabby

Grabby downloads video and audio from different sites supported by yt-dlp. Paste a link, pick the quality or audio only, choose a folder, and track progress in the download queue.

Built with Tauri 2 (Rust), React and TypeScript, with yt-dlp, ffmpeg and Deno bundled inside the app.

## Screenshots

<p align="center"><img src="https://github.com/user-attachments/assets/9bb9a85e-2c14-4b68-ab28-14512817f7f7" alt="App Screenshot" width="750"></p>

## Installation

Download the latest version from the [Releases page](https://github.com/whicencer/grabby/releases/latest).

### Windows

1. Download `Grabby_<version>_x64-setup.exe`.
2. Run the installer.
3. If SmartScreen shows "Windows protected your PC", click **More info** → **Run anyway**.
4. Launch Grabby from the Start menu.

### macOS

1. Download the `.dmg` for your Mac:
   - Apple Silicon (M1 and newer): `Grabby_<version>_aarch64.dmg`
   - Intel: `Grabby_<version>_x64.dmg`
2. Open the `.dmg` and drag Grabby into **Applications**.
3. The app is not notarized yet, so remove the quarantine flag:
   ```bash
   xattr -dr com.apple.quarantine /Applications/Grabby.app
   ```
4. Launch Grabby from **Applications**.
