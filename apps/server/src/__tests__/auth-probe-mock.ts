/* eslint-disable @typescript-eslint/no-explicit-any */
import { mock } from "node:test"
import { __test__ as probeInternals, type AuthProbe, type AuthProbeOptions } from "../auth-probe"

/**
 * Replace the iovalkey AUTH probe in unit tests. `answer` is called once per
 * probe with the probe's options. Return an object with the probe's commands
 * (`info`, `customCommand`), or throw to make Valkey reject the attempt.
 * Returns the options of every probe and a function that restores the probe.
 */
export const mockAuthProbe = (
  answer: (options: AuthProbeOptions) => Partial<AuthProbe> | Promise<Partial<AuthProbe>>,
): { calls: AuthProbeOptions[]; restore: () => void } => {
  const calls: AuthProbeOptions[] = []
  const original = probeInternals.connect
  probeInternals.connect = async (options: AuthProbeOptions) => {
    calls.push(options)
    const commands = await answer(options)
    return {
      info: commands.info ?? (async () => "cluster_enabled:0"),
      customCommand: commands.customCommand ?? (async () => []),
      close: mock.fn(),
    } as AuthProbe
  }
  return { calls, restore: () => { probeInternals.connect = original } }
}

/** The error Valkey returns for a wrong password or an unknown user, as iovalkey reports it. */
export const wrongPassReply = (): Error =>
  Object.assign(new Error("WRONGPASS invalid username-password pair or user is disabled."), { name: "ReplyError" }) as any
