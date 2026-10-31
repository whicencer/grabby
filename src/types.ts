export interface VideoInfo {
  id:          string;
  url:         string;
  title:       string;
  channel:     string | null;
  duration:    number | null;
  thumbnail:   string | null;
  formats:     Format[];
}

export interface Format {
  id:        string;
  ext:       string;
  height:    number | null;
  fps:       number | null;
  abr:       number | null;
  filesize:  number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  vcodec:    string | null; // e.g. "avc1.64002A", "vp9", "av01...", "none"
  acodec:    string | null; // e.g. "mp4a.40.2", "opus", "none"
}

// What the user picked in the preview before pressing "Download"
export type DownloadChoice =
  | { kind: "video"; maxHeight: number | null }
  | { kind: "audio"; formatId: string | null };


export type QualityOption = {
  value: string;
  label: string;
};

// Payload of the "download-progress" event from Rust
export type DownloadProgress = {
  id: string;
  status: string; // "downloading" | "finished" | "error"
  percent: number | null;
  speed: number | null; // bytes per second
  eta: number | null; // seconds
};
