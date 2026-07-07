import { Skeleton } from '@/components/ui/skeleton'

export default function CatalogoLoading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto w-full flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-40 rounded-md" />
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b border-border">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
