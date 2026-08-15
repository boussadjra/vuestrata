/**
 * Single-path folder silhouette for `clip-path: path(...)`.
 *
 * The tab's trailing edge is one cubic from the tab top into the body top —
 * a shoulder, not a vertical wall with a fillet stuck on.
 */

export interface FolderPathInput {
  width: number
  height: number
  tabWidth: number
  tabHeight: number
  radius: number
  rtl?: boolean
}

function n(value: number): number {
  return Math.round(Math.max(0, value) * 10) / 10
}

export function folderClipPath(input: FolderPathInput): string {
  const w = input.width
  const h = input.height
  if (w < 8 || h < 8) return ''

  const tw = Math.min(Math.max(input.tabWidth, 24), w - 12)
  const th = Math.min(Math.max(input.tabHeight, 16), h * 0.55)
  const r = Math.min(Math.max(input.radius, 0), th / 2, tw / 2, (h - th) / 2, w / 4)
  const s = Math.min(Math.max(th, r * 1.25), w - tw - Math.max(r, 4) - 2)

  const X = (value: number) => n(input.rtl ? w - value : value)
  const sweep: 0 | 1 = input.rtl ? 0 : 1
  const arc = (x: number, y: number) =>
    r >= 0.5 ? `A${n(r)} ${n(r)} 0 0 ${sweep} ${X(x)} ${n(y)}` : `L${X(x)} ${n(y)}`

  return [
    `M${X(0)} ${n(r)}`,
    arc(r, 0),
    `H${X(tw)}`,
    `C${X(tw + s * 0.28)} 0 ${X(tw + s * 0.72)} ${n(th)} ${X(tw + s)} ${n(th)}`,
    `H${X(w - r)}`,
    arc(w, th + r),
    `V${n(h - r)}`,
    arc(w - r, h),
    `H${X(r)}`,
    arc(0, h - r),
    `V${n(r)}`,
    'Z',
  ].join(' ')
}
