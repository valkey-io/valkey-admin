import { normalizeEndpoint, type Endpoint } from "valkey-common"
import type { ClusterNodeMap } from "./metrics-orchestrator"
import type { OwnerState } from "./owner"

/**
 * Temporary: which owner a cluster connection joins.
 *
 * The `clusterId` comes from `CLUSTER SLOTS` on the server the request just
 * authenticated against. A fake server can report any id, so the id alone
 * must not select an owner. This rule checks the claim from both sides:
 *
 * 1. The node N that passed AUTH is in the candidate owner's registry for
 *    that cluster. The registry came from the owner's own client.
 * 2. The candidate owner's seed node is in the topology that N reported.
 *
 * An attacker can lie about their own topology, but cannot make the real
 * cluster list the attacker's host. If the victim connected first, rule 1
 * fails for the attacker. If the attacker connected first with a fake list
 * that includes the victim's nodes, rule 1 passes for the victim but rule 2
 * fails, because the real topology does not list the attacker's seed. The
 * env owner's registry came from the operator's `VALKEY_HOST`, so for it rule
 * 1 is enough. A connection through the owner's own seed always joins.
 *
 * Limitation: both rules compare the hosts that `CLUSTER SLOTS` announces. An
 * owner whose seed is a name the nodes do not announce (a Kubernetes service,
 * `localhost` for nodes that announce `127.0.0.1`, a hostname alias) fails
 * rule 2 for every other node, so each node connected from the topology view
 * gets its own owner and its own collectors. Connecting through the cluster
 * endpoint form avoids this: discovery connects to the first announced node.
 *
 * This file goes away when clusters get a server-chosen identity. It has one
 * caller, `connectPending`.
 */

const endpointsOf = (nodes: ClusterNodeMap): Endpoint[] => {
  const out: Array<Endpoint | undefined> = []
  for (const node of Object.values(nodes)) {
    out.push(safeNormalize(node.host, node.port))
    for (const replica of node.replicas ?? []) out.push(safeNormalize(replica.host, replica.port))
  }
  return out.filter((e): e is Endpoint => e !== undefined)
}

const safeNormalize = (host: string, port: string | number): Endpoint | undefined => {
  try {
    return normalizeEndpoint(host, port)
  } catch {
    return undefined
  }
}

const sameEndpoint = (a: Endpoint, b: Endpoint) => a.host === b.host && a.port === b.port

const contains = (nodes: ClusterNodeMap, endpoint: Endpoint) =>
  endpointsOf(nodes).some((candidate) => sameEndpoint(candidate, endpoint))

/**
 * The owner state that a connection by `identity` through `endpoint` to the
 * cluster `clusterId` with `topology` joins, or undefined when none qualifies.
 * `candidates` are the owner states with this identity.
 */
export function findClusterOwner(
  clusterId: string,
  endpoint: Endpoint,
  topology: ClusterNodeMap,
  candidates: OwnerState[],
): OwnerState | undefined {
  for (const candidate of candidates) {
    const registry = candidate.clusterNodesRegistry.get(clusterId)
    if (!registry) continue
    // Reconnecting through the owner's own seed: nothing to prove.
    if (candidate.seed && sameEndpoint(candidate.seed, endpoint)) return candidate
    if (!contains(registry, endpoint)) continue
    if (candidate.env) return candidate
    if (candidate.seed && contains(topology, candidate.seed)) return candidate
  }
  return undefined
}
