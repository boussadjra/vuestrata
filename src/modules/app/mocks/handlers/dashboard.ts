import { http, HttpResponse, delay } from 'msw'

import { isValidToken } from '../utils'

export const dashboardHandlers = [
  http.get('*/dashboard/stats', async ({ request }) => {
    await delay(200)
    if (!isValidToken(request)) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    return HttpResponse.json({
      totalUsers: 12_483,
      activeUsers: 8_291,
      revenue: 48_205,
      growth: 12.5,
      newSignups: 342,
      churnRate: 2.1,
    })
  }),

  http.get('*/dashboard/activity', async ({ request }) => {
    await delay(200)
    if (!isValidToken(request)) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    return HttpResponse.json([
      {
        date: '2026-03-01',
        users: 820,
        revenue: 6800,
        pageViews: 45_200,
        sessions: 12_400,
      },
      {
        date: '2026-03-02',
        users: 850,
        revenue: 7200,
        pageViews: 47_800,
        sessions: 13_100,
      },
      {
        date: '2026-03-03',
        users: 780,
        revenue: 6100,
        pageViews: 42_000,
        sessions: 11_800,
      },
      {
        date: '2026-03-04',
        users: 910,
        revenue: 7800,
        pageViews: 51_300,
        sessions: 14_200,
      },
      {
        date: '2026-03-05',
        users: 870,
        revenue: 7400,
        pageViews: 48_600,
        sessions: 13_500,
      },
      {
        date: '2026-03-06',
        users: 920,
        revenue: 8100,
        pageViews: 53_100,
        sessions: 14_800,
      },
      {
        date: '2026-03-07',
        users: 960,
        revenue: 8600,
        pageViews: 56_400,
        sessions: 15_600,
      },
    ])
  }),

  http.get('*/dashboard/revenue-breakdown', async () => {
    await delay(200)
    return HttpResponse.json([
      { name: 'Subscriptions', value: 68 },
      { name: 'One-time', value: 15 },
      { name: 'Enterprise', value: 12 },
      { name: 'Add-ons', value: 5 },
    ])
  }),

  http.get('*/dashboard/team-performance', async () => {
    await delay(200)
    return HttpResponse.json([
      { name: 'Engineering', tasks: 142, completed: 128, efficiency: 90 },
      { name: 'Design', tasks: 87, completed: 81, efficiency: 93 },
      { name: 'Marketing', tasks: 65, completed: 52, efficiency: 80 },
      { name: 'Sales', tasks: 95, completed: 88, efficiency: 93 },
      { name: 'Support', tasks: 210, completed: 195, efficiency: 93 },
    ])
  }),
]
