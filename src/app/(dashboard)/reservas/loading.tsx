import { Skeleton } from '@/components/ui/skeleton'

export default function ReservasLoading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-4 max-w-4xl mx-auto p-6 w-full">
        {/* Title + CTA */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-32 rounded-md" />
          <Skeleton className="h-8 w-36 rounded-md" />
        </div>

        {/* Segmented control */}
        <Skeleton className="h-9 w-72 rounded-lg" />

        {/* Lead rows */}
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
