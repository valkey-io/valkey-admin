export interface ElectronNavigation {
  onNavigate: (callback: (route: string) => void) => void
}

export interface ValkeyAdminRuntime {
  wsToken: string
}

declare global {
  interface Window {
    electronNavigation: ElectronNavigation
    valkeyAdminRuntime?: ValkeyAdminRuntime
  }
}
