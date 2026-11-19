import { useCallback, useEffect, useState } from 'react';
import { fetchProjects } from '../lib/api';
import type { Project } from '../lib/project';

type Fetcher = (signal?: AbortSignal) => Promise<Project[]>;

export type ProjectsState =
  | { status: 'loading'; projects: null; error: null }
  | { status: 'error'; projects: null; error: Error }
  | { status: 'success'; projects: Project[]; error: null };

// One request per fetcher: pages that mount later (e.g. /charts) reuse the result.
let cache = new WeakMap<Fetcher, Promise<Project[]>>();
// The resolved value too, so a page that mounts later can render with data on its first paint:
// scroll restoration on Back needs the full-height page to already be there.
let resolved = new WeakMap<Fetcher, Project[]>();

/** For tests: forget every cached response. */
export function resetProjectsCache() {
  cache = new WeakMap();
  resolved = new WeakMap();
}

function load(fetcher: Fetcher): Promise<Project[]> {
  let promise = cache.get(fetcher);
  if (!promise) {
    promise = fetcher();
    cache.set(fetcher, promise);
    promise.then(
      (projects) => resolved.set(fetcher, projects),
      () => cache.delete(fetcher) // a failure must be retryable
    );
  }
  return promise;
}

/** The only way components get project data. Fetches once, then serves from memory. */
export function useProjects(fetcher: Fetcher = fetchProjects): ProjectsState & { retry: () => void } {
  const [state, setState] = useState<ProjectsState>(() => {
    const projects = resolved.get(fetcher);
    return projects ? { status: 'success', projects, error: null } : { status: 'loading', projects: null, error: null };
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load(fetcher).then(
      (projects) => {
        if (!cancelled) setState({ status: 'success', projects, error: null });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            projects: null,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [fetcher, attempt]);

  const retry = useCallback(() => {
    cache.delete(fetcher);
    resolved.delete(fetcher);
    setState({ status: 'loading', projects: null, error: null });
    setAttempt((n) => n + 1);
  }, [fetcher]);

  return { ...state, retry };
}
