import { useState } from "react"
import { useSelector } from "react-redux"
import { LayoutDashboard, Search } from "lucide-react"
import { useParams } from "react-router"
import { formatBytes } from "@common/src/bytes-conversion"
import { Database } from "lucide-react"
import { accordionDescriptions } from "@common/src/dashboard-metrics"
import { singleMetricDescriptions } from "@common/src/dashboard-metrics"
import { AppHeader } from "../ui/app-header"
import Accordion from "../ui/accordion"
import DonutChart from "../ui/donut-chart"
import CpuMemoryUsage from "./cpu-memory-usage"
import { SplitPanel } from "../ui/split-panel"
import { Panel } from "../ui/panel"
import { Input } from "../ui/input"
import { StatCard } from "../ui/stat-card"
import RouteContainer from "../ui/route-container"
import { selectData } from "@/state/valkey-features/info/infoSelectors.ts"

export function Dashboard() {
  const { id } = useParams()
  const infoData = useSelector(selectData(id!)) || {}
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
    connected_clients: infoData.connected_clients,
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
    <RouteContainer title="Dashboard">
      <AppHeader
        icon={<LayoutDashboard size={20} />}
        title="Dashboard"
      />
      <div className="flex-1 overflow-y-auto">
        {/* Memory Area */}
        <div className="flex mb-4">
          <div className="w-1/2 pr-2">
            <StatCard
              icon={<Database className="text-tw-primary" size={24} />}
              label="Total Memory"
              value={formatBytes(memoryUsageMetrics.total_system_memory || 0)}
            />
          </div>
          <div className="w-1/2 pl-2">
            <StatCard
              icon={<Database className="text-tw-primary" size={24} />}
              label="Used Memory"
              value={formatBytes(memoryUsageMetrics.used_memory || 0)}
            />
          </div>
        </div>
        <SplitPanel
          left={
            <Panel className="overflow-y-auto p-2">
              {/* Search or Filtering Input */}
              <div className="mb-4 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 z-10" size={18} />
                <Input
                  className="pl-10"
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
            </Panel>
          }
          right={
            <Panel className="p-4">
              <DonutChart />
            </Panel>
          }
          rightClassName="pl-2"
        />
        {/* cpu and memory usage charts */}
        <CpuMemoryUsage />
      </div>
    </RouteContainer>
  )
}
