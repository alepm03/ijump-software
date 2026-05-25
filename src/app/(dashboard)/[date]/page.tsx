export default async function DayPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const { date } = await params

  return (
    <div className="p-8">
      <p className="text-sm text-zinc-500 mb-1">{date}</p>
      <h1 className="text-2xl font-semibold text-white">Vista Operacional</h1>
      <p className="mt-2 text-zinc-400">Módulo 5 — en construcción.</p>
    </div>
  )
}
