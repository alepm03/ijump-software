import { Skeleton } from '@/components/ui/skeleton'

export default function AdminLoading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-4 max-w-4xl mx-auto p-6 w-full">
        <Skeleton className="h-7 w-48 rounded-md" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
