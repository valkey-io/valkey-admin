import type { NavigateFunction, Params, Location } from "react-router"

// the path user refershed from
const refreshPath = window.location.hash.replace(/^#/, "").split("?")[0]

const history = {
  location: null as unknown as Location,
  navigate: null as unknown as NavigateFunction,
  params: null as unknown as Readonly<Params<string>>,
  refreshedFrom: (refreshPath.startsWith("/") ? refreshPath : null) as string | null,
}

export const wasRefreshedFrom = (connectionId: string): boolean =>
  Boolean(history.refreshedFrom?.includes(`/${connectionId}/`)) &&
  !history.refreshedFrom!.endsWith("/valkey-reconnect")

export default history
