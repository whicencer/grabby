use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read};
use std::process::{Child, Command, Stdio};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

// Marks our JSON progress lines in yt-dlp stdout
const PROGRESS_PREFIX: &str = "GRABBY ";
// Marks the final file info (JSON), printed once after ffmpeg is done
const FILE_PREFIX: &str = "GRABBY_FILE ";
const PROGRESS_EVENT: &str = "download-progress";
// A few UI updates per second is enough
const EMIT_INTERVAL: Duration = Duration::from_millis(250);

#[derive(Serialize)]
struct AppInfo {
    version: String,
    os: String,
    arch: String,
}

// What yt-dlp -J returns: only the fields we use, unknown ones are ignored
#[derive(Deserialize)]
struct RawVideoInfo {
    id: String,
    webpage_url: String,
    title: String,
    channel: Option<String>,
    uploader: Option<String>,
    duration: Option<f64>,
    thumbnail: Option<String>,
    #[serde(default)]
    formats: Vec<RawFormat>,
}

#[derive(Deserialize)]
struct RawFormat {
    format_id: String,
    ext: String,
    height: Option<u32>,
    fps: Option<f64>,
    abr: Option<f64>,
    filesize: Option<u64>,
    filesize_approx: Option<u64>,
    vcodec: Option<String>,
    acodec: Option<String>,
    // 10 = original audio track, -1 = dub (or no info when the video has one language)
    language_preference: Option<i32>,
}

// Original language is marked only on videos with dubbed tracks
const ORIGINAL_LANGUAGE: i32 = 10;

impl RawFormat {
    // Dubbed audio, or the DRC (volume-levelled) copy of the original: not offered in the UI
    fn is_extra_audio(&self, has_original: bool) -> bool {
        let is_dub = has_original && self.language_preference.unwrap_or(-1) < ORIGINAL_LANGUAGE;
        self.format_id.ends_with("-drc") || (is_dub && !has_track(&self.vcodec))
    }
}

// What the UI gets: mirrors src/types.ts
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoInfo {
    id: String,
    url: String,
    title: String,
    channel: Option<String>,
    duration: Option<f64>,
    thumbnail: Option<String>,
    formats: Vec<Format>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Format {
    id: String,
    ext: String,
    height: Option<u32>,
    fps: Option<f64>,
    abr: Option<f64>,
    filesize: Option<u64>,
    has_video: bool,
    has_audio: bool,
    vcodec: Option<String>,
    acodec: Option<String>,
}

// yt-dlp writes "none" when a track is absent; a missing codec means unknown, so we keep it
fn has_track(codec: &Option<String>) -> bool {
    codec.as_deref() != Some("none")
}

impl From<RawFormat> for Format {
    fn from(raw: RawFormat) -> Self {
        Format {
            has_video: has_track(&raw.vcodec),
            has_audio: has_track(&raw.acodec),
            id: raw.format_id,
            ext: raw.ext,
            height: raw.height,
            fps: raw.fps,
            abr: raw.abr,
            filesize: raw.filesize.or(raw.filesize_approx),
            vcodec: raw.vcodec,
            acodec: raw.acodec,
        }
    }
}

impl From<RawVideoInfo> for VideoInfo {
    fn from(raw: RawVideoInfo) -> Self {
        let has_original = raw
            .formats
            .iter()
            .any(|f| f.language_preference == Some(ORIGINAL_LANGUAGE));

        VideoInfo {
            id: raw.id,
            url: raw.webpage_url,
            title: raw.title,
            channel: raw.channel.or(raw.uploader),
            duration: raw.duration,
            thumbnail: raw.thumbnail,
            formats: raw
                .formats
                .into_iter()
                .filter(|f| !f.is_extra_audio(has_original))
                .map(Format::from)
                // Storyboards have neither video nor audio
                .filter(|format| format.has_video || format.has_audio)
                .collect(),
        }
    }
}

// What the user picked in the preview: mirrors DownloadChoice in src/types.ts
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
enum DownloadChoice {
    Video { max_height: Option<u32> },
    Audio { format_id: Option<String> },
}

// One progress line from yt-dlp: only the fields we use. Numbers can be null early on
#[derive(Deserialize)]
struct RawProgress {
    status: String,
    downloaded_bytes: Option<f64>,
    total_bytes: Option<f64>,
    total_bytes_estimate: Option<f64>,
    speed: Option<f64>,
    eta: Option<f64>,
}

// What the UI gets in the "download-progress" event: mirrors src/types.ts
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    id: String,
    status: String,
    percent: Option<f64>,
    speed: Option<f64>,
    eta: Option<f64>,
}

impl DownloadProgress {
    fn new(id: &str, raw: RawProgress) -> Self {
        let total = raw.total_bytes.or(raw.total_bytes_estimate);
        let percent = match (raw.downloaded_bytes, total) {
            (Some(done), Some(total)) if total > 0.0 => Some(done / total * 100.0),
            _ => None,
        };
        DownloadProgress {
            id: id.to_string(),
            status: raw.status,
            percent,
            speed: raw.speed,
            eta: raw.eta,
        }
    }
}

// What yt-dlp prints after the download
#[derive(Deserialize)]
struct DownloadedFile {
    filepath: String,
}

// Turns the user's choice into yt-dlp arguments. Pure: no process, easy to test
fn build_args(choice: &DownloadChoice, output_dir: &str, url: &str) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();

    match choice {
        DownloadChoice::Video { max_height } => {
            let (selector, sort) = match max_height {
                Some(h) => (format!("bv*[height<={h}]+ba/b[height<={h}]"), "lang,res,vcodec:h264,acodec:aac"),
                None => ("bv*+ba/b".to_string(), "lang,vcodec:h264,res,acodec:aac"),
            };
            args.push("-f".to_string());
            args.push(selector);
            args.push("-S".to_string());
            args.push(sort.to_string());
            args.push("--merge-output-format".to_string());
            args.push("mp4".to_string());
        }
        DownloadChoice::Audio { format_id } => {
            let selector = match format_id {
                Some(id) => id.clone(),
                None => "ba[acodec^=mp4a]/ba".to_string(),
            };
            args.push("-f".to_string());
            args.push(selector);
            // Original audio track, never a dub
            args.push("-S".to_string());
            args.push("lang".to_string());
            // Stream copy into .m4a when the source is AAC; other sites may need a light audio encode
            args.push("-x".to_string());
            args.push("--audio-format".to_string());
            args.push("m4a".to_string());
        }
    }

    // Download fragments in parallel (HLS/DASH sites): faster, almost no CPU
    args.push("-N".to_string());
    args.push("4".to_string());

    // Quiet human output, but print progress as one JSON object per line
    args.push("--quiet".to_string());
    args.push("--progress".to_string());
    args.push("--newline".to_string());
    args.push("--progress-template".to_string());
    args.push(format!("download:{PROGRESS_PREFIX}%(progress)j"));
    args.push("--print".to_string());
    args.push(format!("after_move:{FILE_PREFIX}%(.{{filepath}})j"));

    args.push("--no-playlist".to_string());
    args.push("-P".to_string());
    args.push(output_dir.to_string());
    args.push("-o".to_string());
    args.push("%(title)s [%(id)s].%(ext)s".to_string());
    // "--" ends the options: a URL starting with "-" can't be read as a flag
    args.push("--".to_string());
    args.push(url.to_string());

    args
}

#[tauri::command]
fn get_app_info(app: tauri::AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
}

#[tauri::command]
fn validate_url(url: &str) -> Result<String, String> {
    let url = url.trim();

    if url.is_empty() {
        return Err("URL is empty".to_string());
    }

    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("URL must start with http:// or https://".to_string());
    }

    Ok(url.to_string())
}

#[tauri::command]
async fn fetch_info(url: String) -> Result<VideoInfo, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        Command::new("yt-dlp")
            .args(["-J", "--no-playlist", "--", &url])
            .output()
    })
    .await
    .map_err(|e| e.to_string())?;

    let output = result.map_err(|e| format!("Failed to run yt-dlp: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let raw: RawVideoInfo = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse yt-dlp output: {e}"))?;

    Ok(VideoInfo::from(raw))
}

// Resolves with the saved file path; progress goes to the UI as events tagged with `id`
#[tauri::command]
async fn start_download(
    app: AppHandle,
    id: String,
    url: String,
    choice: DownloadChoice,
    output_dir: String,
) -> Result<String, String> {
    let args = build_args(&choice, &output_dir, &url);

    tauri::async_runtime::spawn_blocking(move || run_download(&app, &id, &args))
        .await
        .map_err(|e| e.to_string())?
}

// Sends at most one event per EMIT_INTERVAL
#[derive(Default)]
struct Throttle {
    last: Option<Instant>,
}

impl Throttle {
    fn ready(&mut self) -> bool {
        if self.last.is_some_and(|t| t.elapsed() < EMIT_INTERVAL) {
            return false;
        }
        self.last = Some(Instant::now());
        true
    }
}

// Read stderr on its own thread: if its pipe fills up, the process blocks and stdout stalls
fn read_stderr_in_background(child: &mut Child) -> JoinHandle<String> {
    let mut stderr = child.stderr.take().expect("stderr is piped");
    std::thread::spawn(move || {
        let mut text = String::new();
        let _ = stderr.read_to_string(&mut text);
        text
    })
}

// Blocking: runs yt-dlp and reads its stdout line by line while it downloads
fn run_download(app: &AppHandle, id: &str, args: &[String]) -> Result<String, String> {
    let mut child = Command::new("yt-dlp")
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run yt-dlp: {e}"))?;

    let stderr_reader = read_stderr_in_background(&mut child);
    let stdout = child.stdout.take().expect("stdout is piped");
    let mut throttle = Throttle::default();
    let mut file: Option<DownloadedFile> = None;

    for line in BufReader::new(stdout).lines() {
        let Ok(line) = line else { break };
        if let Some(json) = line.strip_prefix(FILE_PREFIX) {
            file = serde_json::from_str(json).ok();
            continue;
        }
        let Some(json) = line.strip_prefix(PROGRESS_PREFIX) else { continue };
        let Ok(raw) = serde_json::from_str::<RawProgress>(json) else { continue };

        // Throttle "downloading" updates, but never drop "finished"
        if raw.status == "downloading" && !throttle.ready() {
            continue;
        }
        let _ = app.emit(PROGRESS_EVENT, DownloadProgress::new(id, raw));
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    let stderr_text = stderr_reader.join().unwrap_or_default();

    if !status.success() {
        return Err(stderr_text.trim().to_string());
    }

    file.map(|f| f.filepath)
        .ok_or_else(|| "yt-dlp finished but didn't report the file".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            validate_url,
            fetch_info,
            start_download
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn video_with_height_limits_both_selectors() {
        let choice = DownloadChoice::Video { max_height: Some(720) };
        let args = build_args(&choice, "/tmp", "https://x.com/v");
        assert_eq!(args[0..2], ["-f", "bv*[height<=720]+ba/b[height<=720]"]);
        assert!(args.contains(&"mp4".to_string()));
    }

    #[test]
    fn best_audio_extracts_audio() {
        let choice = DownloadChoice::Audio { format_id: None };
        let args = build_args(&choice, "/tmp", "https://x.com/v");
        assert_eq!(args[0..5], ["-f", "ba[acodec^=mp4a]/ba", "-S", "lang", "-x"]);
        assert_eq!(args.last().unwrap(), "https://x.com/v");
    }

    #[test]
    fn progress_percent_falls_back_to_estimate() {
        let raw: RawProgress = serde_json::from_str(
            r#"{"status":"downloading","downloaded_bytes":50,"total_bytes":null,"total_bytes_estimate":200,"eta":null,"speed":null}"#,
        )
        .unwrap();
        assert_eq!(DownloadProgress::new("a", raw).percent, Some(25.0));
    }

    #[test]
    fn best_video_prefers_h264_over_resolution() {
        let args = build_args(&DownloadChoice::Video { max_height: None }, "/tmp", "https://x.com/v");
        assert_eq!(args[2..4], ["-S", "lang,vcodec:h264,res,acodec:aac"]);
    }

    #[test]
    fn dubs_and_drc_are_hidden_only_when_an_original_exists() {
        let audio = |id: &str, pref: i32| -> RawFormat {
            serde_json::from_value(serde_json::json!({
                "format_id": id, "ext": "m4a", "vcodec": "none", "acodec": "mp4a.40.2",
                "language_preference": pref
            }))
            .unwrap()
        };
        assert!(!audio("140-23", 10).is_extra_audio(true));
        assert!(audio("140-5", -1).is_extra_audio(true));
        assert!(audio("140-drc", 10).is_extra_audio(true));
        // Single-language video: nothing is marked original, keep everything
        assert!(!audio("140", -1).is_extra_audio(false));
    }

    #[test]
    fn choice_parses_from_ui_json() {
        let choice: DownloadChoice = serde_json::from_str(r#"{"kind":"video","maxHeight":1080}"#).unwrap();
        assert!(matches!(choice, DownloadChoice::Video { max_height: Some(1080) }));
    }
}
