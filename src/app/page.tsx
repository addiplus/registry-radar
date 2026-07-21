import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { Dashboard } from "@/components/dashboard";
import {
  DEFAULT_GITHUB_USER,
  DEFAULT_NPM_SCOPE,
  SSR_PREFETCH_PACKAGE_CAP,
} from "@/lib/constants";
import { qk } from "@/lib/query/keys";
import {
  getDownloadSeries,
  getPackageMeta,
  listScopePackages,
} from "@/lib/server/npm";
import type { ScopePackagesResponse } from "@/lib/types";
import { getQueryClient } from "./get-query-client";

// Server prefetch must run per request so deploys never serve a frozen snapshot.
export const dynamic = "force-dynamic";

export default async function Home() {
  const queryClient = getQueryClient();

  // The prefetch calls the server functions directly (no internal HTTP hop);
  // the dehydrated shapes match what the client fetchers return (plan section 5).
  await queryClient.prefetchQuery({
    queryKey: qk.packages(DEFAULT_NPM_SCOPE),
    queryFn: () => listScopePackages(DEFAULT_NPM_SCOPE),
  });

  const listing = queryClient.getQueryData<ScopePackagesResponse>(
    qk.packages(DEFAULT_NPM_SCOPE),
  );
  const names = (listing?.packages ?? [])
    .slice(0, SSR_PREFETCH_PACKAGE_CAP)
    .map((pkg) => pkg.name);

  await Promise.all(
    names.flatMap((name) => [
      queryClient.prefetchQuery({
        queryKey: qk.packageMeta(name),
        queryFn: () => getPackageMeta(name),
      }),
      queryClient.prefetchQuery({
        queryKey: qk.downloads(name, 30),
        queryFn: () => getDownloadSeries(name, 30),
      }),
    ]),
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Dashboard defaultScope={DEFAULT_NPM_SCOPE} defaultUser={DEFAULT_GITHUB_USER} />
    </HydrationBoundary>
  );
}
