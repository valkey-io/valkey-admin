import {
  ORCHESTRATOR_AUTH_DOMAIN,
  ORCHESTRATOR_AUTH_HEADER,
  ORCHESTRATOR_AUTH_KEY_ENV,
  createOrchestratorAuthCredential
} from "valkey-common"

/** Key material handed to this collector, by the spawning orchestrator or by an operator. */
export const readOrchestratorKey = () => process.env[ORCHESTRATOR_AUTH_KEY_ENV]

const withCredential = (credential, body) =>
  credential === null
    ? null
    : {
      headers: {
        "Content-Type": "application/json",
        [ORCHESTRATOR_AUTH_HEADER]: credential,
      },
      body: JSON.stringify(body),
    }

/**
 * Build the signed `POST /orchestrator/register` payload, or `null` when no
 * credential can be produced.
 *
 * Every field sent is signed.
 */
export const buildRegisterRequest = ({
  key,
  nodeId,
  metricsServerUri,
  timestamp = Date.now(),
}) => withCredential(
  createOrchestratorAuthCredential(key ?? "", ORCHESTRATOR_AUTH_DOMAIN.REGISTER, {
    nodeId,
    metricsServerUri,
    timestamp,
  }),
  { metricsServerUri, nodeId, timestamp },
)

/**
 * Build the signed `POST /orchestrator/ping` payload, or `null` when no
 * credential can be produced. Signed under a distinct domain so this
 * credential cannot be presented as a registration.
 */
export const buildPingRequest = ({ key, nodeId, timestamp = Date.now() }) => withCredential(
  createOrchestratorAuthCredential(key ?? "", ORCHESTRATOR_AUTH_DOMAIN.PING, { nodeId, timestamp }),
  { nodeId, timestamp },
)
