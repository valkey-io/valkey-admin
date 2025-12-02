import { VALKEY_CLIENT } from "../../../common/src/constants.ts"

interface BuildScanCommandArgsOptions {
  cursor: string;
  pattern?: string;
  count?: number;
}

export const buildScanCommandArgs = ({
  cursor,
  pattern = VALKEY_CLIENT.SCAN.defaultPayloadPattern,
  count = VALKEY_CLIENT.SCAN.defaultCount,
}: BuildScanCommandArgsOptions) => ["SCAN", cursor, "MATCH", pattern, "COUNT", String(count)]
