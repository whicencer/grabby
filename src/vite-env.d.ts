/// <reference types="vite/client" />

interface ImportMetaEnv {
  // "1" = network commands use mocks (pnpm tauri:mock)
  readonly VITE_MOCK?: string;
}
