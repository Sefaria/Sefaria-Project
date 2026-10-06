import { QueryClient } from "@tanstack/react-query";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        // Library data rarely changes; a reconnect should not storm the API.
        refetchOnReconnect: false,
      },
    },
  });
}
