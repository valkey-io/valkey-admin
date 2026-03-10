export interface ElectronNavigation {
  onNavigate: (callback: (route: string) => void) => void
}

declare global {
  interface Window {
    electronNavigation: ElectronNavigation
  }
}
