import { Skeleton } from '@/components/ui/skeleton'

export default function AdministracionLoading() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Nav tabs */}
      <div className="bg-card border-b border-border px-7 py-3 flex items-center gap-2">
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-4xl mx-auto w-full flex flex-col gap-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          {/* Table rows */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-3 border-b border-border">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
