/**
 * Compile-time proof that the reader's own types still match the self-contained copies in contract/surface-host.v1.ts. Nothing imports
 * this file; `npm run typecheck` compiles it, and fails here when the reader state API or the workspace commands change shape without
 * the contract (which would then need a new minor or major version).
 *
 * Both directions are checked where data crosses the seam (snapshots, workspaces): what the reader gives must fit the contract, and
 * what a surface sends back in the contract's shape must fit the reader.
 *
 * @feature SHL-078 SurfaceHost v1
 */
import type * as Real from "~/lib/reader-state/core/types";
import type { WorkspaceCommands as RealCommands, NavState as RealNavState } from "~/lib/workspace/commands";
import type { Workspace as RealWorkspace } from "~/lib/workspace/types";
import type { SurfaceCommands, SurfaceWorkspace } from "./workspace-view";
import type * as Contract from "../../../contract/surface-host.v1";

export const readerStateApiFits = (api: Real.ReaderStateApi): Contract.ReaderStateApi => api;
export const snapshotFromReader = (s: Real.ReaderSnapshot): Contract.ReaderSnapshot => s;
export const snapshotToReader = (s: Contract.ReaderSnapshot): Real.ReaderSnapshot => s;
export const changeFromReader = (c: Real.SnapshotChange): Contract.SnapshotChange => c;
export const applyContextToReader = (c: Contract.ApplyContext): Real.ApplyContext => c;
export const filterToReader = (f: Contract.SliceFilter): Real.SliceFilter => f;
export const applyResultFromReader = (r: Real.ApplyResult): Contract.ApplyResult => r;

// surfaces get the text-only view of the workspace (asset panels are not in contract 1.x: ./workspace-view.ts)
export const commandsFit = (c: SurfaceCommands): Contract.WorkspaceCommands => c;
export const workspaceFromReader = (w: SurfaceWorkspace): Contract.Workspace => w;
export const readerCommandsKeepTheirShape = (c: RealCommands): Omit<Contract.WorkspaceCommands, "current"> => c;
export const workspaceToReader = (w: Contract.Workspace): RealWorkspace => w;
export const navStateToReader = (n: Contract.NavState): RealNavState => n;
export const navStateFromReader = (n: RealNavState): Contract.NavState => n;
