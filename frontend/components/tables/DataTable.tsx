"use client"
import { cn } from "@/lib/utils"

export interface Column<T> {
  accessor: (row: T, idx: number) => React.ReactNode
  className?: string
  header: React.ReactNode
}

export default function DataTable<T>({
  columns,
  data,
  keyFn,
}: {
  columns: readonly Column<T>[]
  data: readonly T[]
  keyFn: (row: T, idx: number) => number | string
}) {
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="text-muted-foreground text-left">
          {columns.map((c, i) => (
            <th className={cn("py-2", c.className)} key={i}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="text-foreground">
        {data.map((row, i) => (
          <tr className="border-foreground border-t" key={keyFn(row, i)}>
            {columns.map((c, j) => {
              const cell = c.accessor(row, i)
              return (
                <td className={cn("py-2", c.className)} key={j}>
                  {typeof cell === "number" && isNaN(cell) ? "—" : cell}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
