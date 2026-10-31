#!/usr/bin/env node
// Puts the helpers for one Tauri target into src-tauri/binaries/<name>-<target>[.exe],
// the layout Tauri expects for sidecars (bundle.externalBin):
//   yt-dlp, deno: pinned release + pinned SHA-256, downloaded from GitHub
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
    ytdlp: { asset: "yt-dlp_macos", sha256: "0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa" },
    deno: { asset: "deno-aarch64-apple-darwin.zip", sha256: "9f0bf660393da2eaff044cdc7444cb08c73f235849b61d224d825a194ce7c98e" },
  },
  "x86_64-apple-darwin": {
    exe: "",
    // yt-dlp_macos is universal: the same file serves both Mac targets
    ytdlp: { asset: "yt-dlp_macos", sha256: "0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa" },
    deno: { asset: "deno-x86_64-apple-darwin.zip", sha256: "4b2f5edd2639b7470f034238b321d7002d8dfb4726d8558f52c17afac370eb2c" },
  },
  "x86_64-pc-windows-msvc": {
    exe: ".exe",
    ytdlp: { asset: "yt-dlp.exe", sha256: "f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d" },
    deno: { asset: "deno-x86_64-pc-windows-msvc.zip", sha256: "cba84b26e0df5ae7f74fc66b86a95b866872a86292ebd84fa1e959927edd93bf" },
  },
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN_DIR = join(ROOT, "src-tauri", "binaries");

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
const wanted = { ytdlp: YTDLP_VERSION, deno: DENO_VERSION, ffmpeg: ffmpegVersion() };
mkdirSync(BIN_DIR, { recursive: true });

if (needs("ytdlp", "yt-dlp")) {
  const { asset, sha256 } = config.ytdlp;
  const data = await download(`https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/${asset}`, sha256);
  install("yt-dlp", data);
}

if (needs("deno", "deno")) {
  const { asset, sha256 } = config.deno;
  const zip = await download(`https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/${asset}`, sha256);
  const dir = mkdtempSync(join(tmpdir(), "grabby-deno-"));
  writeFileSync(join(dir, asset), zip);
  // On Windows "tar" may be GNU tar from Git, which can't unpack zip files
  if (process.platform === "win32") {
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Path '${asset}' -DestinationPath .`], { cwd: dir });
  } else {
    execFileSync("unzip", ["-q", asset], { cwd: dir });
  }
  install("deno", readFileSync(join(dir, `deno${config.exe}`)));
  rmSync(dir, { recursive: true, force: true });
}

if (!skipFfmpeg && (needs("ffmpeg", "ffmpeg") || !existsSync(binPath("ffprobe")))) {
  execFileSync("bash", [join(ROOT, "scripts", "build-ffmpeg.sh"), target], { stdio: "inherit" });
}

writeFileSync(stampPath, JSON.stringify(wanted, null, 2) + "\n");
console.log(`Helpers for ${target} are in ${BIN_DIR}`);

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
