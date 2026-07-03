import { Skeleton } from '@/components/ui/skeleton'

function FlightCardSkeleton({ participantCount }: { participantCount: number }) {
  return (
    <div className="rounded-[10px] border border-border bg-card overflow-hidden">
      {/* Flight header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Skeleton className="w-4 h-4 rounded" />
        <Skeleton className="w-24 h-4 rounded" />
        <Skeleton className="w-16 h-5 rounded-full" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="w-16 h-4 rounded" />
          <Skeleton className="w-7 h-7 rounded-md" />
          <Skeleton className="w-7 h-7 rounded-md" />
        </div>
      </div>
      {/* Participant rows */}
      {Array.from({ length: participantCount }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
          <Skeleton className="w-4 h-4 rounded" />
          <Skeleton className="w-32 h-4 rounded" />
          <Skeleton className="w-20 h-5 rounded-full" />
          <Skeleton className="w-16 h-5 rounded-full" />
          <Skeleton className="w-20 h-4 rounded ml-auto" />
          <Skeleton className="w-12 h-4 rounded" />
        </div>
      ))}
    </div>
  )
}

export default function DayLoading() {
  return (
    <div className="h-full flex flex-col">

      {/* DayHeader skeleton */}
      <div className="flex items-center justify-between px-7 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Skeleton className="w-7 h-7 rounded-md" />
          <Skeleton className="w-48 h-6 rounded" />
          <Skeleton className="w-20 h-6 rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="w-24 h-8 rounded-lg" />
          <Skeleton className="w-8 h-8 rounded-lg" />
        </div>
      </div>

      {/* Flights area */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2.5 px-7 py-5 max-w-[60rem] mx-auto">
          <FlightCardSkeleton participantCount={2} />
          <FlightCardSkeleton participantCount={1} />
          <FlightCardSkeleton participantCount={2} />
          {/* Add flight button skeleton */}
          <Skeleton className="w-full h-12 rounded-[10px]" />
        </div>
      </div>

      {/* Summary panel skeleton */}
      <div className="border-t border-border bg-card px-7 py-3 flex items-center gap-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <Skeleton className="w-8 h-4 rounded" />
            <Skeleton className="w-14 h-3 rounded" />
          </div>
        ))}
      </div>

    </div>
  )
}
