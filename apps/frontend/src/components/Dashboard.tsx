import { useState } from "react"
import { useSelector } from "react-redux"
import { LayoutDashboard, Search } from "lucide-react"
import { useParams } from "react-router"
import { formatBytes } from "@common/src/bytes-conversion"
import { Database } from "lucide-react"
import { accordionDescriptions } from "@common/src/dashboard-metrics"
import { singleMetricDescriptions } from "@common/src/dashboard-metrics"
import { AppHeader } from "./ui/app-header"
import Accordion from "./ui/accordion"
import DonutChart from "./ui/donut-chart"
import { selectData } from "@/state/valkey-features/info/infoSelectors.ts"

export function Dashboard() {
  const { id } = useParams()
  const infoData = useSelector(selectData(id!))
  const [searchQuery, setSearchQuery] = useState("")

  if (!infoData) {
    return (
      <div className="flex flex-col h-screen p-4">
        <AppHeader
          icon={<LayoutDashboard size={20} />}
          title="Dashboard"
        />
        <div className="flex flex-1 items-center justify-center">
          <span className="text-gray-500">Loading metrics…</span>
        </div>
      </div>
    )
  }
  
  const memoryUsageMetrics = {
    used_memory: infoData.used_memory,
    used_memory_dataset: infoData.used_memory_dataset,
    used_memory_functions: infoData.used_memory_functions,
    used_memory_vm_eval: infoData.used_memory_vm_eval,
    used_memory_peak: infoData.used_memory_peak,
    used_memory_scripts: infoData.used_memory_scripts,
    total_system_memory: infoData.total_system_memory,
  }

  const upTimeMetrics = {
    evicted_scripts: infoData.evicted_scripts,
    uptime_in_seconds: infoData.uptime_in_seconds,
    total_net_input_bytes: infoData.total_net_input_bytes,
    total_net_output_bytes: infoData.total_net_output_bytes,
  }

  const replicationPersistenceMetrics = {
    rdb_bgsave_in_progress: infoData.rdb_bgsave_in_progress,
    rdb_changes_since_last_save: infoData.rdb_changes_since_last_save,
    rdb_saves: infoData.rdb_saves,
    mem_replication_backlog: infoData.mem_replication_backlog,
    sync_full: infoData.sync_full,
    repl_backlog_active: infoData.repl_backlog_active,
  }

  const clientConnectivityMetrics = {
    blocked_clients: infoData.blocked_clients,
    clients_in_timeout_table: infoData.clients_in_timeout_table,
    connected_clients : infoData.connected_clients,
    connected_slaves: infoData.connected_slaves,
    total_connections_received: infoData.total_connections_received,
    evicted_clients: infoData.evicted_clients,
    rejected_connections: infoData.rejected_connections,
    total_reads_processed: infoData.total_reads_processed,
    total_writes_processed: infoData.total_writes_processed,
    tracking_clients: infoData.tracking_clients,
    watching_clients: infoData.watching_clients,
  }

  const commandExecutionMetrics = {
    total_commands_processed: infoData.total_commands_processed,
    total_blocking_keys: infoData.total_blocking_keys,
    total_error_replies: infoData.total_error_replies,
    total_watched_keys: infoData.total_watched_keys,
    unexpected_error_replies: infoData.unexpected_error_replies,
  }

  const dataEffectivenessAndEvictionMetrics = {
    evicted_keys: infoData.evicted_keys,
    expired_keys: infoData.expired_keys,
    expired_stale_perc: infoData.expired_stale_perc,
    keyspace_hits: infoData.keyspace_hits,
    keyspace_misses: infoData.keyspace_misses,
    number_of_cached_scripts: infoData.number_of_cached_scripts,
    number_of_functions: infoData.number_of_functions,
  }

  const messagingMetrics = {
    pubsubshard_channels: infoData.pubsubshard_channels,
    pubsub_channels: infoData.pubsub_channels,
    pubsub_clients: infoData.pubsub_clients,
    pubsub_patterns: infoData.pubsub_patterns,
  }

  return (
    <div className="flex flex-col h-screen p-4">
      <AppHeader
        icon={<LayoutDashboard size={20} />}
        title="Dashboard"
      />
      {/* Memory Area */}
      <div className="flex justify-evenly dark:border-tw-dark-border border rounded mb-4">
        {[
          ["Total Memory", memoryUsageMetrics.total_system_memory],
          ["Used Memory", memoryUsageMetrics.used_memory]].map(([label, value]) => (
          <div className="h-20 w-1/3 p-4 flex items-center justify-center gap-4" key={label}>
            <Database className="mb-2 text-tw-primary" size={40} />
            <div className="flex flex-col items-center">
              <span className="text-2xl font-semibold">
                {formatBytes(value as number)}
              </span>
              <span className="font-light text-sm">{label}</span>
            </div>
          </div>))}
      </div>
      <div className="flex flex-1 min-h-0 gap-3">
        {/* Accordion Area */}
        <div className="w-1/2 overflow-y-auto border dark:border-tw-dark-border rounded p-2">
          {/* Search or Filtering Input */}
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              className="w-full pl-10 pr-4 py-2 border dark:border-tw-dark-border rounded bg-white dark:bg-gray-800
               focus:outline-none focus:ring-2 focus:ring-tw-primary"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search metrics..."
              type="text"
              value={searchQuery}
            />
          </div>
          <Accordion
            accordionDescription={accordionDescriptions.memoryUsageMetrics}
            accordionItems={memoryUsageMetrics}
            accordionName="Memory Usage Metrics"
            searchQuery={searchQuery}
            singleMetricDescriptions={singleMetricDescriptions} 
            valueType="bytes" />
          <Accordion
            accordionDescription={accordionDescriptions.uptimeMetrics}
            accordionItems={upTimeMetrics}
            accordionName="Uptime Metrics"
            searchQuery={searchQuery}
            singleMetricDescriptions={singleMetricDescriptions} 
            valueType="mixed" />
          <Accordion
            accordionDescription={accordionDescriptions.replicationPersistenceMetrics}
            accordionItems={replicationPersistenceMetrics}
            accordionName="Replication & Persistence Metrics"
            searchQuery={searchQuery}
            singleMetricDescriptions={singleMetricDescriptions} 
            valueType="number" />
          <Accordion
            accordionDescription={accordionDescriptions.clientConnectivityMetrics}
            accordionItems={clientConnectivityMetrics}
            accordionName="Client Connectivity Metrics"
            searchQuery={searchQuery}
            singleMetricDescriptions={singleMetricDescriptions} 
            valueType="number" />
          <Accordion
            accordionDescription={accordionDescriptions.commandExecutionMetrics}
            accordionItems={commandExecutionMetrics}
            accordionName="Command Execution Metrics"
            searchQuery={searchQuery}
            singleMetricDescriptions={singleMetricDescriptions} 
            valueType="number" />
          <Accordion
            accordionDescription={accordionDescriptions.dataEffectivenessEvictionMetrics}
            accordionItems={dataEffectivenessAndEvictionMetrics}
            accordionName="Data Effectiveness & Eviction Metrics"
            searchQuery={searchQuery} 
            singleMetricDescriptions={singleMetricDescriptions}
            valueType="number" />
          <Accordion
            accordionDescription={accordionDescriptions.messagingMetrics}
            accordionItems={messagingMetrics}
            accordionName="Messaging Metrics"
            searchQuery={searchQuery} 
            singleMetricDescriptions={singleMetricDescriptions}
            valueType="number" />
        </div>
        {/* Chart Area */}
        <div className="w-1/2 overflow-y-auto border dark:border-tw-dark-border rounded p-2 text-tw-primary flex 
        items-center justify-center"><DonutChart /></div>
      </div>
    </div>
  )

}
