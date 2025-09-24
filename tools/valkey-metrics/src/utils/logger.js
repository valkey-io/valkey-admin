const levels = { debug: 20, info: 30, warn: 40, error: 50, silent: 60 }

const pickLevel = () => {
  const lvl = String(process.env.LOG_LEVEL || "info").toLowerCase()
  return levels[lvl] ?? levels.info
}

const asString = x => {
  if (x instanceof Error) return x.stack || `${x.name}: ${x.message}`
  if (typeof x === "object") return JSON.stringify(x)
  return String(x)
}

const linePretty = (ts, name, level, args) =>
  `${ts} ${level.toUpperCase()} ${name ? `[${name}] ` : ""}${args.map(asString).join(" ")}`

const lineJSON = (ts, name, level, args) =>
  JSON.stringify({ ts, level, name, msg: args.map(asString).join(" ") })

export const createLogger = name => {
  const min = pickLevel()
  const fmt = String(process.env.LOG_FORMAT || "pretty").toLowerCase()  // pretty | json

  const write = (level, ...args) => {
    const code = levels[level]
    if (code < min) return
    const ts = new Date().toISOString()
    const line = fmt === "json" ? lineJSON(ts, name, level, args) : linePretty(ts, name, level, args)
    const out = level === "error" || level === "warn" ? process.stderr : process.stdout
    out.write(line + "\n")
  }

  return {
    debug: (...a) => write("debug", ...a),
    info:  (...a) => write("info",  ...a),
    warn:  (...a) => write("warn",  ...a),
    error: (...a) => write("error", ...a)
  }
}
