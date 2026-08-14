import { toMajorUnits } from '~/lib/money'

import type { ActivityPoint } from '../types/dashboard'

/**
 * Split an activity series into independently scaled plot values.
 *
 * `revenue` is cents. Overlaying it with `activeUsers` on one axis hides the
 * user line (~8k vs ~640k) and labels money as a compact count of cents.
 * Charts plot major-unit revenue on its own Y-axis; counts stay on the other.
 */
export function activityChartSeries(points: readonly ActivityPoint[]) {
  return {
    revenueMajor: points.map((point) => toMajorUnits(point.revenue)),
    activeUsers: points.map((point) => point.activeUsers),
  }
}

/** Left axis: money. Right axis: counts. */
export const REVENUE_Y_AXIS = 0
export const USERS_Y_AXIS = 1
