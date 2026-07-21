'use client';

import { isApiError } from '@/lib/api-error';
import { useScopePackages } from '@/lib/query/hooks';
import { PackageCard } from './package-card';
import { CardSkeleton } from './skeleton';
import { EmptyState, ErrorState, StaleBanner } from './states';

interface PackageGridProps {
  scope: string;
  onOpenPackage: (name: string) => void;
}

export function PackageGrid({ scope, onOpenPackage }: PackageGridProps) {
  const packagesQuery = useScopePackages(scope);

  if (packagesQuery.isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }, (_, index) => (
          <CardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (packagesQuery.isError && packagesQuery.data === undefined) {
    const error = packagesQuery.error;
    const message = isApiError(error)
      ? error.message
      : 'Package listing failed to load. Try again.';
    return (
      <ErrorState
        message={message}
        onRetry={() => {
          void packagesQuery.refetch();
        }}
      />
    );
  }

  const packages = packagesQuery.data?.packages ?? [];

  if (packages.length === 0) {
    return <EmptyState message={`No packages found for ${scope}.`} />;
  }

  return (
    <div>
      {packagesQuery.isError && (
        <StaleBanner message="Showing cached data. Refresh failed, retry shortly." />
      )}
      <p className="mb-3 text-xs text-muted">
        {`${packages.length} package${packages.length === 1 ? "" : "s"} in ${scope}`}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((summary) => (
          <PackageCard key={summary.name} summary={summary} onOpen={onOpenPackage} />
        ))}
      </div>
    </div>
  );
}
