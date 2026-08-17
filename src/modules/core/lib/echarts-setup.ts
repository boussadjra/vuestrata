import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

/**
 * Register the chart types every dashboard panel needs.
 *
 * ECharts tree-shakes by registration — importing a type in a route page is
 * easy to forget and fails silently until `setOption` runs. BaseChart calls this
 * once so any consumer renders without depending on a parent page's side effect.
 *
 * `use()` is safe to repeat; ECharts ignores duplicate registrations.
 */
export function ensureEchartsRegistered(): void {
  use([
    CanvasRenderer,
    LineChart,
    BarChart,
    PieChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
  ])
}
