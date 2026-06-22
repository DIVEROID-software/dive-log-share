/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL của API (vd: https://diveroid30api.diveroid.com). */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
