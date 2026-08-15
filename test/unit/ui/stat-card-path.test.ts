import { describe, expect, it } from 'vite-plus/test'

import { folderClipPath } from '@/components/ui/stat-card-path'

const sample = {
  width: 280,
  height: 120,
  tabWidth: 118,
  tabHeight: 40,
  radius: 16,
}

describe('folderClipPath', () => {
  it('emits a closed path whose shoulder is a cubic, not a vertical drop', () => {
    const d = folderClipPath(sample)

    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d).toContain('C')
    expect(d).toMatch(/H118(\.0)? C/)
  })

  it('mirrors the tab onto the inline-end edge in RTL', () => {
    const ltr = folderClipPath(sample)
    const rtl = folderClipPath({ ...sample, rtl: true })

    expect(rtl).not.toBe(ltr)
    expect(rtl).toContain('H162')
  })

  it('returns empty when the card has not been measured yet', () => {
    expect(folderClipPath({ ...sample, width: 0, height: 0 })).toBe('')
  })
})
