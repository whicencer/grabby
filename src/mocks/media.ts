import type { VideoInfo } from "../types";

export const mockVideo: VideoInfo = {
  id: "a1b2c3",
  url: "https://example.com/watch?v=a1b2c3",
  title: "How the Rust compiler works: from source to machine code",
  channel: "Low Level Talks",
  duration: 1847,
  thumbnail: "https://picsum.photos/seed/grabby-video/640/360",
  formats: [
    { id: "313", ext: "webm", height: 2160, fps: 30, abr: null, filesize: 1_920_000_000, hasVideo: true, hasAudio: false, vcodec: "vp9", acodec: "none" },
    { id: "299", ext: "mp4", height: 1080, fps: 60, abr: null, filesize: 612_000_000, hasVideo: true, hasAudio: false, vcodec: "avc1.64002A", acodec: "none" },
    { id: "137", ext: "mp4", height: 1080, fps: 30, abr: null, filesize: 418_000_000, hasVideo: true, hasAudio: false, vcodec: "avc1.640028", acodec: "none" },
    { id: "136", ext: "mp4", height: 720, fps: 29.97, abr: null, filesize: 214_000_000, hasVideo: true, hasAudio: false, vcodec: "avc1.4d401f", acodec: "none" },
    { id: "135", ext: "mp4", height: 480, fps: 30, abr: null, filesize: null, hasVideo: true, hasAudio: false, vcodec: "avc1.4d401e", acodec: "none" },
    { id: "18", ext: "mp4", height: 360, fps: 30, abr: 96.5, filesize: 61_000_000, hasVideo: true, hasAudio: true, vcodec: "avc1.42001E", acodec: "mp4a.40.2" },
    { id: "140", ext: "m4a", height: null, fps: null, abr: 129.476, filesize: 29_800_000, hasVideo: false, hasAudio: true, vcodec: "none", acodec: "mp4a.40.2" },
    { id: "251", ext: "webm", height: null, fps: null, abr: 160.2, filesize: null, hasVideo: false, hasAudio: true, vcodec: "none", acodec: "opus" },
  ],
};

export const mockLiveVideo: VideoInfo = {
  id: "live42",
  url: "https://example.com/live/42",
  title: "Live: building a downloader in Rust",
  channel: "дарвин.",
  duration: 952402,
  thumbnail: null,
  formats: [
    { id: "hls-720p", ext: "mp4", height: 720, fps: 30, abr: null, filesize: null, hasVideo: true, hasAudio: true, vcodec: "avc1.64001f", acodec: "mp4a.40.2" },
    { id: "hls-480p", ext: "mp4", height: 480, fps: 30, abr: null, filesize: null, hasVideo: true, hasAudio: true, vcodec: "avc1.4d401e", acodec: "mp4a.40.2" },
  ],
};

// Stands in for the future Rust `fetch_info` command until it exists
// The URL picks the scenario, see SCENARIOS in mockApi.ts
export function mockFetchVideo(url: string): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // Rejects with the same objects as the Rust commands (src/api/errors.ts)
      if (url.includes("info-bot")) {
        reject({ kind: "botCheck" });
      } else if (url.includes("info-fail")) {
        reject({ kind: "failed", message: "ERROR: [generic] Unsupported URL: " + url });
      } else if (url.includes("live")) {
        resolve({ ...mockLiveVideo, url });
      } else {
        resolve({ ...mockVideo, url });
      }
    }, 900);
  });
}
