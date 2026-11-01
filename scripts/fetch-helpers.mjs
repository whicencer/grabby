#!/usr/bin/env node
// Puts the helpers for one Tauri target into src-tauri/binaries/<name>-<target>[.exe],
// the layout Tauri expects for sidecars (bundle.externalBin):
//   deno: pinned release + pinned SHA-256, downloaded from GitHub
//   yt-dlp: same, but it's a folder (exe + _internal/, the "onedir" build) in src-tauri/binaries/yt-dlp/,
//     bundled as a resource: the single-file build unpacks itself on every run and is ~30x slower to start
//   ffmpeg, ffprobe: our minimal LGPL build, see build-ffmpeg.sh
//
// Usage: node scripts/fetch-helpers.mjs [target-triple] [--force] [--no-ffmpeg]
//   target defaults to this machine. Files whose pinned version hasn't changed are skipped.
//   --no-ffmpeg: CI builds ffmpeg in its own (cached) step, e.g. in MSYS2 on Windows
//
// To bump a helper: change its version and hashes below (hashes come from the release's
// SHA2-256SUMS for yt-dlp and *.zip.sha256sum for Deno).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const YTDLP_VERSION = "2026.10.26";
const DENO_VERSION = "2.9.8";

const TARGETS = {
  "aarch64-apple-darwin": {
    exe: "",
    ytdlp: { asset: "yt-dlp_macos.zip", exe: "yt-dlp_macos", sha256: "20d98fa608998eff87d1d35a6e9fb65e4b874639a6cc89addc19da3becde3ef1" },
    deno: { asset: "deno-aarch64-apple-darwin.zip", sha256: "9f0bf660393da2eaff044cdc7444cb08c73f235849b61d224d825a194ce7c98e" },
  },
  "x86_64-apple-darwin": {
    exe: "",
    // yt-dlp_macos is universal: the same build serves both Mac targets
    ytdlp: { asset: "yt-dlp_macos.zip", exe: "yt-dlp_macos", sha256: "20d98fa608998eff87d1d35a6e9fb65e4b874639a6cc89addc19da3becde3ef1" },
    deno: { asset: "deno-x86_64-apple-darwin.zip", sha256: "4b2f5edd2639b7470f034238b321d7002d8dfb4726d8558f52c17afac370eb2c" },
  },
  "x86_64-pc-windows-msvc": {
    exe: ".exe",
    ytdlp: { asset: "yt-dlp_win.zip", exe: "yt-dlp.exe", sha256: "fd51b212cf8380c7a52ee08c0d6be7f3c59b2f2c832eaf7b45acfae6eab57419" },
    deno: { asset: "deno-x86_64-pc-windows-msvc.zip", sha256: "cba84b26e0df5ae7f74fc66b86a95b866872a86292ebd84fa1e959927edd93bf" },
  },
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN_DIR = join(ROOT, "src-tauri", "binaries");
const YTDLP_DIR = join(BIN_DIR, "yt-dlp");

const args = process.argv.slice(2);
const force = args.includes("--force");
const skipFfmpeg = args.includes("--no-ffmpeg");
const target = args.find((a) => !a.startsWith("--")) ?? hostTarget();
const config = TARGETS[target];
if (!config) {
  console.error(`Unsupported target: ${target}. Supported: ${Object.keys(TARGETS).join(", ")}`);
  process.exit(1);
}

// What was fetched last time for this target: lets us skip unchanged helpers
const stampPath = join(BIN_DIR, `.versions-${target}.json`);
const stamp = existsSync(stampPath) ? JSON.parse(readFileSync(stampPath, "utf8")) : {};
// yt-dlp's folder is shared by all targets: remember which target it was fetched for
const wanted = { ytdlp: `${YTDLP_VERSION} ${config.ytdlp.asset}`, deno: DENO_VERSION, ffmpeg: ffmpegVersion() };
mkdirSync(BIN_DIR, { recursive: true });

if (force || stamp.ytdlp !== wanted.ytdlp || !existsSync(join(YTDLP_DIR, config.ytdlp.exe))) {
  const { asset, sha256 } = config.ytdlp;
  const zip = await download(`https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/${asset}`, sha256);
  rmSync(YTDLP_DIR, { recursive: true, force: true });
  unzip(zip, asset, YTDLP_DIR);
  console.log(`  -> ${YTDLP_DIR}`);
}

if (needs("deno", "deno")) {
  const { asset, sha256 } = config.deno;
  const zip = await download(`https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/${asset}`, sha256);
  const dir = mkdtempSync(join(tmpdir(), "grabby-deno-"));
  unzip(zip, asset, dir);
  install("deno", readFileSync(join(dir, `deno${config.exe}`)));
  rmSync(dir, { recursive: true, force: true });
}

if (!skipFfmpeg && (needs("ffmpeg", "ffmpeg") || !existsSync(binPath("ffprobe")))) {
  execFileSync("bash", [join(ROOT, "scripts", "build-ffmpeg.sh"), target], { stdio: "inherit" });
}

writeFileSync(stampPath, JSON.stringify(wanted, null, 2) + "\n");
console.log(`Helpers for ${target} are in ${BIN_DIR}`);

// Writes the zip next to `dest` and unpacks it there
function unzip(data, name, dest) {
  mkdirSync(dest, { recursive: true });
  const zipPath = join(dest, name);
  writeFileSync(zipPath, data);
  // On Windows "tar" may be GNU tar from Git, which can't unpack zip files
  if (process.platform === "win32") {
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Path '${name}' -DestinationPath .`], { cwd: dest });
  } else {
    execFileSync("unzip", ["-q", name], { cwd: dest });
  }
  rmSync(zipPath);
}

function hostTarget() {
  const info = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  return info.match(/^host: (.+)$/m)[1];
}

function ffmpegVersion() {
  const script = readFileSync(join(ROOT, "scripts", "build-ffmpeg.sh"), "utf8");
  return script.match(/^FFMPEG_VERSION="(.+)"$/m)[1];
}

function binPath(name) {
  return join(BIN_DIR, `${name}-${target}${config.exe}`);
}

function needs(key, name) {
  return force || stamp[key] !== wanted[key] || !existsSync(binPath(name));
}

async function download(url, expectedSha256) {
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== expectedSha256.toLowerCase()) {
    throw new Error(`Checksum mismatch for ${url}: got ${actual}`);
  }
  return data;
}

function install(name, data) {
  const path = binPath(name);
  // Write next to the target first, so an interrupted run never leaves a half-written helper
  const temp = `${path}.tmp`;
  writeFileSync(temp, data);
  chmodSync(temp, 0o755);
  copyFileSync(temp, path);
  rmSync(temp);
  console.log(`  -> ${path}`);
}
