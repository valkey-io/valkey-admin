/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VALKEY_ADMIN_WS_URL?: string
  readonly VITE_LOCAL_VALKEY_HOST?: string
  readonly VITE_LOCAL_VALKEY_PORT?: string
  readonly VITE_LOCAL_VALKEY_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
