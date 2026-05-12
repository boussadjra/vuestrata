import type { Component } from 'vue'

export interface DocEntry {
  slug: string
  title: string
  description: string
  content: string
  order: number
  section: string
  sectionOrder: number
  subsection?: string
  subsectionLabel?: string
  subsectionOrder?: number
  component?: Component
}

export interface SubsectionGroup {
  key: string
  label: string
  order: number
  items: DocEntry[]
}

export type SidebarEntry =
  | { kind: 'item'; doc: DocEntry; order: number }
  | { kind: 'group'; group: SubsectionGroup; order: number }

export interface SidebarSection {
  key: string
  label: string
  order: number
  entries: SidebarEntry[]
}

export function getGroupKey(section: string, subsection: string) {
  return `${section}/${subsection}`
}

export function getGroupPanelId(key: string) {
  return `docs-sidebar-group-${key.replace(/[^a-z0-9_-]/gi, '-')}`
}

export function getSidebarEntryLabel(entry: SidebarEntry) {
  return entry.kind === 'item' ? entry.doc.title : entry.group.label
}

export function getSidebarEntrySortTier(sectionKey: string, entry: SidebarEntry) {
  if (sectionKey !== 'components') return 0
  if (entry.kind === 'item' && entry.doc.slug === 'components/overview') return 0
  if (entry.kind === 'group') return 1
  return 2
}

export function sortSidebarEntries(sectionKey: string, left: SidebarEntry, right: SidebarEntry) {
  const leftTier = getSidebarEntrySortTier(sectionKey, left)
  const rightTier = getSidebarEntrySortTier(sectionKey, right)
  if (leftTier !== rightTier) return leftTier - rightTier

  const orderDiff = left.order - right.order
  if (orderDiff !== 0) return orderDiff

  return getSidebarEntryLabel(left).localeCompare(getSidebarEntryLabel(right))
}

export function buildSidebarSections(docs: DocEntry[]): SidebarSection[] {
  const sections = new Map<string, { label: string; order: number }>()

  for (const doc of docs) {
    if (!doc.section || sections.has(doc.section)) continue
    sections.set(doc.section, { label: doc.section.replace(/-/g, ' '), order: doc.sectionOrder })
  }

  return [...sections.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => left.order - right.order)
    .map((section) => {
      const sectionDocs = docs.filter((doc) => doc.section === section.key)

      const regularItems: SidebarEntry[] = sectionDocs
        .filter((doc) => !doc.subsection)
        .map((doc) => ({ kind: 'item' as const, doc, order: doc.order }))

      const labelOverrides = new Map<string, string>()
      for (const doc of sectionDocs) {
        if (doc.subsection && doc.subsectionLabel) {
          labelOverrides.set(getGroupKey(section.key, doc.subsection), doc.subsectionLabel)
        }
      }

      const subsectionGroups = new Map<string, SubsectionGroup>()
      for (const doc of sectionDocs.filter((entry) => entry.subsection)) {
        const groupKey = getGroupKey(section.key, doc.subsection!)
        if (!subsectionGroups.has(groupKey)) {
          subsectionGroups.set(groupKey, {
            key: groupKey,
            label: labelOverrides.get(groupKey) ?? doc.subsection!.replace(/-/g, ' '),
            order: doc.subsectionOrder!,
            items: [],
          })
        }
        subsectionGroups.get(groupKey)!.items.push(doc)
      }

      for (const group of subsectionGroups.values()) {
        group.items.sort((left, right) => left.order - right.order)
      }

      const groupEntries: SidebarEntry[] = [...subsectionGroups.values()].map((group) => ({
        kind: 'group' as const,
        group,
        order: group.order,
      }))

      return {
        ...section,
        entries: [...regularItems, ...groupEntries].sort((left, right) =>
          sortSidebarEntries(section.key, left, right),
        ),
      }
    })
}

export function findActiveSidebarGroup(sections: SidebarSection[], currentSlug: string) {
  for (const section of sections) {
    for (const entry of section.entries) {
      if (entry.kind === 'group' && entry.group.items.some((doc) => doc.slug === currentSlug)) {
        return entry.group
      }
    }
  }

  return undefined
}
