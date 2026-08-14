import { describe, expect, it } from 'vite-plus/test'

import {
  activityChartSeries,
  REVENUE_Y_AXIS,
  USERS_Y_AXIS,
} from '@/modules/analytics/lib/activity-chart'

describe('activityChartSeries', () => {
  it('plots revenue in major units so it can share a chart with user counts', () => {
    const series = activityChartSeries([
      { date: '2026-08-01', revenue: 640_000, activeUsers: 8_240, sessions: 13_100 },
      { date: '2026-08-02', revenue: 100, activeUsers: 1, sessions: 1 },
    ])

    // 640_000 cents is $6,400 — same order of magnitude as 8_240 users.
    // Plotting cents would pin users to the axis floor.
    expect(series.revenueMajor).toEqual([6_400, 1])
    expect(series.activeUsers).toEqual([8_240, 1])
  })

  it('keeps money on the left axis and counts on the right', () => {
    expect(REVENUE_Y_AXIS).toBe(0)
    expect(USERS_Y_AXIS).toBe(1)
  })
})
