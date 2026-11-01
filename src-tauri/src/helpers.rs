// Where the helper binaries live, and how yt-dlp keeps itself up to date.
//
// ffmpeg, ffprobe and deno are Tauri sidecars next to the app executable: Contents/MacOS on macOS,
// the install folder on Windows, target/debug in `tauri dev`.
//
// yt-dlp is a folder (executable + _internal/, yt-dlp's "onedir" build) in the app resources.
// The single-file build unpacks Python into a new temp folder on every run, and macOS/Defender
// re-scan it each time: ~10 s per run instead of ~0.3 s.
//
// A signed bundle is read-only, so newer yt-dlp versions go to <app data>/helpers/yt-dlp/<version>/
// and are used instead of the bundled one. Each update is checked (SHA-256 + `--version`) before
// it becomes active, and the previous version is kept to fall back to.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const RELEASES_API: &str = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";
// GitHub allows 60 unauthenticated API requests per hour: once a day is plenty
const CHECK_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

// Release asset (a zip of the onedir build) and the executable inside it
#[cfg(target_os = "macos")]
const YTDLP_ASSET: &str = "yt-dlp_macos.zip";
#[cfg(target_os = "macos")]
const YTDLP_EXE: &str = "yt-dlp_macos";
#[cfg(target_os = "windows")]
const YTDLP_ASSET: &str = "yt-dlp_win.zip";
#[cfg(target_os = "windows")]
const YTDLP_EXE: &str = "yt-dlp.exe";
#[cfg(target_os = "linux")]
const YTDLP_ASSET: &str = "yt-dlp_linux.zip";
#[cfg(target_os = "linux")]
const YTDLP_EXE: &str = "yt-dlp_linux";

// Folder with the bundled helpers
pub fn bundled_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.to_path_buf()))
        .unwrap_or_default()
}

pub fn bundled(name: &str) -> PathBuf {
    bundled_dir().join(format!("{name}{}", std::env::consts::EXE_SUFFIX))
}

// yt-dlp shipped with the app (bundle.resources: "binaries/yt-dlp/" -> "helpers/yt-dlp/").
// Not just "yt-dlp/": that name clashes with the old yt-dlp sidecar file in target/ folders
fn bundled_yt_dlp(app: &AppHandle) -> PathBuf {
    let resources = app.path().resource_dir().unwrap_or_else(|_| bundled_dir());
    resources.join("helpers").join("yt-dlp").join(YTDLP_EXE)
}

// Without this, every helper run flashes a console window on Windows
pub fn hide_console(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = command;
}

// What's installed in the updates folder. Saved as state.json next to the versions
#[derive(Serialize, Deserialize, Default, Debug, PartialEq)]
struct State {
    active: Option<String>,
    previous: Option<String>,
    // Unix seconds of the last check against GitHub
    last_check: u64,
}

fn updates_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("helpers").join("yt-dlp"))
}

fn version_path(dir: &Path, version: &str) -> PathBuf {
    dir.join(version).join(YTDLP_EXE)
}

fn load_state(dir: &Path) -> State {
    std::fs::read(dir.join("state.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn save_state(dir: &Path, state: &State) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let temp = dir.join("state.json.tmp");
    let json = serde_json::to_vec_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(&temp, json).map_err(|e| e.to_string())?;
    // rename is atomic: a crash never leaves a half-written state.json
    std::fs::rename(&temp, dir.join("state.json")).map_err(|e| e.to_string())
}

// yt-dlp to run: the active update, else the previous one, else the bundled one
pub fn yt_dlp_path(app: &AppHandle) -> PathBuf {
    if let Some(dir) = updates_dir(app) {
        let state = load_state(&dir);
        for version in [state.active, state.previous].into_iter().flatten() {
            let path = version_path(&dir, &version);
            if path.is_file() {
                return path;
            }
        }
    }
    bundled_yt_dlp(app)
}

// Runs `<path> --version`. None: the binary doesn't start or fails
fn version_of(path: &Path) -> Option<String> {
    let mut command = Command::new(path);
    command.arg("--version");
    hide_console(&mut command);
    let output = command.output().ok()?;
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (output.status.success() && !version.is_empty()).then_some(version)
}

// Called on launch. Runs yt-dlp once, then (once a day) installs a newer one from GitHub.
// Ok(Some(version)) = updated
pub async fn update_yt_dlp_if_due(app: &AppHandle) -> Result<Option<String>, String> {
    // First run of a yt-dlp folder takes ~10 s while macOS/Defender scan it; later runs are fast.
    // Doing it now means the user's first preview doesn't pay for it
    let current_path = yt_dlp_path(app);
    let current = tauri::async_runtime::spawn_blocking(move || version_of(&current_path))
        .await
        .map_err(|e| e.to_string())?;

    let dir = updates_dir(app).ok_or("No app data folder")?;
    let mut state = load_state(&dir);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    if now.saturating_sub(state.last_check) < CHECK_INTERVAL.as_secs() {
        return Ok(None);
    }

    let result = update(&dir, &mut state, current.as_deref()).await;
    // Saved on failure too: a broken network shouldn't make us retry on every launch
    state.last_check = now;
    save_state(&dir, &state)?;
    result
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

impl Release {
    fn asset_url(&self, name: &str) -> Result<&str, String> {
        self.assets
            .iter()
            .find(|asset| asset.name == name)
            .map(|asset| asset.browser_download_url.as_str())
            .ok_or_else(|| format!("Release {} has no {name}", self.tag_name))
    }
}

// Downloads the latest release into `dir` if it differs from `current`, verifies it and makes it
// active. Doesn't touch state.last_check. Ok(None) = already up to date
async fn update(
    dir: &Path,
    state: &mut State,
    current: Option<&str>,
) -> Result<Option<String>, String> {
    let client = reqwest::Client::builder()
        // GitHub's API rejects requests without a User-Agent
        .user_agent(concat!("grabby/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let release: Release = get(&client, RELEASES_API)
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let version = release.tag_name.clone();
    if current == Some(version.as_str()) {
        return Ok(None);
    }

    let sums = get(&client, release.asset_url("SHA2-256SUMS")?)
        .await?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let expected = expected_sha256(&sums, YTDLP_ASSET).ok_or("yt-dlp checksum not found")?;
    let bytes = get(&client, release.asset_url(YTDLP_ASSET)?)
        .await?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    if sha256_hex(&bytes) != expected {
        return Err(format!("Checksum mismatch for yt-dlp {version}"));
    }

    let path = version_path(dir, &version);
    let install_version = version.clone();
    tauri::async_runtime::spawn_blocking(move || install(&path, &bytes, &install_version))
        .await
        .map_err(|e| e.to_string())??;

    if state.active.as_deref() != Some(version.as_str()) {
        state.previous = state.active.take();
        state.active = Some(version.clone());
    }
    remove_unused_versions(dir, state);
    Ok(Some(version))
}

async fn get(client: &reqwest::Client, url: &str) -> Result<reqwest::Response, String> {
    client
        .get(url)
        .send()
        .await
        .and_then(|response| response.error_for_status())
        .map_err(|e| format!("{url}: {e}"))
}

// Unpacks the onedir zip into <version>/ and checks that yt-dlp runs and reports `version`
fn install(path: &Path, zip_bytes: &[u8], version: &str) -> Result<(), String> {
    let folder = path.parent().ok_or("Bad install path")?;
    // Unpack into "<version>.download" first: a half-unpacked folder never looks like a version
    let mut temp = folder.as_os_str().to_owned();
    temp.push(".download");
    let temp = PathBuf::from(temp);
    let _ = std::fs::remove_dir_all(&temp);

    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(zip_bytes)).map_err(|e| e.to_string())?;
    archive.extract(&temp).map_err(|e| format!("Failed to unpack yt-dlp {version}: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(temp.join(YTDLP_EXE), std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }

    // A leftover of an earlier failed attempt
    let _ = std::fs::remove_dir_all(folder);
    std::fs::rename(&temp, folder).map_err(|e| e.to_string())?;

    // Also warms up the macOS/Defender scan, so the first real run is fast
    if version_of(path).as_deref() != Some(version) {
        let _ = std::fs::remove_dir_all(folder);
        return Err(format!("yt-dlp {version} failed to start, keeping the current one"));
    }
    Ok(())
}

// Keeps only the active and previous versions
fn remove_unused_versions(dir: &Path, state: &State) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let keep = state.active.as_deref() == Some(name.as_str())
            || state.previous.as_deref() == Some(name.as_str());
        if entry.path().is_dir() && !keep {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

// SHA2-256SUMS lines look like "<hex>  <file name>"
fn expected_sha256(sums: &str, file: &str) -> Option<String> {
    sums.lines().find_map(|line| {
        let (hash, name) = line.split_once("  ")?;
        (name.trim() == file).then(|| hash.to_lowercase())
    })
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_checksum_for_exact_file_name() {
        let sums = "aaa  yt-dlp\nBBB  yt-dlp_macos\nccc  yt-dlp_macos.zip\n";
        assert_eq!(
            expected_sha256(sums, "yt-dlp_macos"),
            Some("bbb".to_string())
        );
        assert_eq!(expected_sha256(sums, "yt-dlp.exe"), None);
    }

    #[test]
    fn sha256_is_lowercase_hex() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn keeps_only_active_and_previous() {
        let dir = std::env::temp_dir().join(format!("grabby-test-{}", std::process::id()));
        for version in ["old", "previous", "active"] {
            std::fs::create_dir_all(dir.join(version)).unwrap();
        }
        let state = State {
            active: Some("active".into()),
            previous: Some("previous".into()),
            last_check: 0,
        };
        remove_unused_versions(&dir, &state);
        assert!(!dir.join("old").exists());
        assert!(dir.join("previous").exists() && dir.join("active").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    // Real download from GitHub (~40 MB): cargo test -- --ignored
    #[test]
    #[ignore]
    fn downloads_and_activates_latest_yt_dlp() {
        let dir = std::env::temp_dir().join(format!("grabby-update-{}", std::process::id()));
        let mut state = State::default();
        let runtime = tauri::async_runtime::block_on(update(&dir, &mut state, Some("2000.01.01")));
        let version = runtime
            .unwrap()
            .expect("an older current version must be updated");
        assert_eq!(state.active.as_deref(), Some(version.as_str()));
        assert_eq!(
            version_of(&version_path(&dir, &version)).as_deref(),
            Some(version.as_str())
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
