/**
 * useLab: is a lab (src/lib/labs.ts) on for this page? Reads the remote config the root loader already put in the query cache (on the
 * server, and dehydrated into the page, so the server and the hydrating client agree) and the deployment's PUBLIC_LABS. Never fetches
 * itself; without a query client (an isolated test) only PUBLIC_LABS counts.
 */
import { useCallback, useContext, useSyncExternalStore } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { PUBLIC_CONFIG } from "~/lib/config";
import { labEnabled, type LabName } from "~/lib/labs";

const REMOTE_CONFIG_KEY = ["remote-config"] as const;
const noSubscribe = () => () => {};

export function useLab(name: LabName): boolean {
  const qc = useContext(QueryClientContext);
  const subscribe = useCallback((cb: () => void) => (qc ? qc.getQueryCache().subscribe(cb) : () => {}), [qc]);
  const read = () => qc?.getQueryData<Record<string, unknown>>(REMOTE_CONFIG_KEY);
  const remote = useSyncExternalStore(qc ? subscribe : noSubscribe, read, read);
  return labEnabled(name, remote, PUBLIC_CONFIG.labs);
}
