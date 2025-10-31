import Valkey from "iovalkey"

//URL hardcoded for testing 
const url = String(process.env.VALKEY_URL || cfg.valkey.url || "valkey://host.docker.internal:6379" ).trim()
export const makeMonitorFetcher = (onLogs = async () => {}, config) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const monitorLoop = async () => {
    const monitorClient = new Valkey(url) 

    const { monitoringInterval, monitoringDuration, maxCommandsPerRun: maxLogs } = config

    while (true) {
      const logs = []
      try {
        const monitor = await monitorClient.monitor()
        console.info(`Valkey monitor connected. Running for ${monitoringDuration/1000} seconds or until we capture ${maxLogs} logs`)
        
        const stopPromise = new Promise(resolve => {
          monitor.on("monitor", (_time, args) => {
            logs.push({ ts: Date.now(), command: args.join(" ") })
            if (logs.length >= maxLogs) resolve("maxLogs")
          })
        })

        // Wait until we reach either duration or maxLogs
        const reason = await Promise.race([
          stopPromise,
          sleep(monitoringDuration).then(() => "duration")
        ])

        console.info(`Monitor run complete (${reason}). Collected ${logs.length} logs.`)

        monitor.disconnect()
        if(logs.length > 0) {
          await onLogs(logs)
        }
        console.info("Monitor sleeping for ", monitoringInterval/1000, " seconds")


        
        await sleep(monitoringInterval)
      
      } catch (err) {
        console.error("Monitor error", err)
        try { await monitorClient.disconnect() } catch {}
        await sleep(Math.min(5000, 0.5 * monitoringInterval))
      }
    }
  }

  monitorLoop().catch(err => console.error("Monitor loop crashed", err))

  return () => {
    console.info("Stopping monitor fetcher (not yet implemented)")
  }

}
