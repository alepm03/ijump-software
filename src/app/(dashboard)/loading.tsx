import { Skeleton } from '@/components/ui/skeleton'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export default function CalendarLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-8 py-7 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1.5">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="w-36 h-7 rounded-md ml-1" />
            <Skeleton className="w-12 h-6 rounded-md ml-2" />
          </div>
          <Skeleton className="w-32 h-9 rounded-lg" />
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-2">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="text-center text-sm font-medium text-muted-foreground py-1.5">
              {wd}
            </div>
          ))}
        </div>

        {/* Grid — 5 rows × 7 cols */}
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="min-h-[96px] rounded-xl" />
          ))}
        </div>

      </div>
    </div>
  )
}
