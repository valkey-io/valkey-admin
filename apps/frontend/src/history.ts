import type { NavigateFunction, Params, Location } from "react-router"

const history = {
  location: null as unknown as Location,
  navigate: null as unknown as NavigateFunction,
  params: null as unknown as Readonly<Params<string>>,
}

export default history
