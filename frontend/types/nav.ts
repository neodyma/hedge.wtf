export type LucideName = "BookOpen" | "Boxes" | "Home" | "Layers" | "List" | "Sparkles"

export type NavManifest = ReadonlyArray<NavRecord>

export type NavMeta = {
  group?: string
  hidden?: boolean
  href?: string
  icon?: LucideName
  includeInNav?: boolean
  priority?: number
  title?: string
}

export type NavRecord = {
  meta: NavMeta
  path: string
}
