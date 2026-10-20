import type {
  BarSeriesOption,
  EChartsOption,
  LineSeriesOption,
  PieSeriesOption,
  ScatterSeriesOption,
} from 'echarts'

export const CHART_FAMILIES = [
  'trends',
  'comparison',
  'composition',
  'distribution',
  'relationship',
  'hierarchy',
  'flow',
  'monitoring',
] as const

export type ChartFamily = (typeof CHART_FAMILIES)[number]
export type GalleryChartFamily = ChartFamily

export const CHART_GALLERY = [
  { id: 'line', family: 'trends' },
  { id: 'smooth-line', family: 'trends' },
  { id: 'step-line', family: 'trends' },
  { id: 'area', family: 'trends' },
  { id: 'stacked-area', family: 'trends' },
  { id: 'percent-area', family: 'trends' },
  { id: 'multi-line', family: 'trends' },
  { id: 'dual-axis', family: 'trends' },
  { id: 'column', family: 'comparison' },
  { id: 'grouped-column', family: 'comparison' },
  { id: 'stacked-column', family: 'comparison' },
  { id: 'horizontal-bar', family: 'comparison' },
  { id: 'grouped-bar', family: 'comparison' },
  { id: 'percent-bar', family: 'comparison' },
  { id: 'diverging-bar', family: 'comparison' },
  { id: 'waterfall', family: 'comparison' },
  { id: 'lollipop', family: 'comparison' },
  { id: 'pictorial-bar', family: 'comparison' },
  { id: 'pie', family: 'composition' },
  { id: 'donut', family: 'composition' },
  { id: 'rose-radius', family: 'composition' },
  { id: 'rose-area', family: 'composition' },
  { id: 'nested-donut', family: 'composition' },
  { id: 'semicircle-donut', family: 'composition' },
  { id: 'histogram', family: 'distribution' },
  { id: 'boxplot', family: 'distribution' },
  { id: 'horizontal-boxplot', family: 'distribution' },
  { id: 'candlestick', family: 'distribution' },
  { id: 'heatmap', family: 'distribution' },
  { id: 'calendar-heatmap', family: 'distribution' },
  { id: 'scatter', family: 'relationship' },
  { id: 'bubble', family: 'relationship' },
  { id: 'effect-scatter', family: 'relationship' },
  { id: 'scatter-regression', family: 'relationship' },
  { id: 'quadrant-scatter', family: 'relationship' },
  { id: 'parallel', family: 'relationship' },
  { id: 'treemap', family: 'hierarchy' },
  { id: 'nested-treemap', family: 'hierarchy' },
  { id: 'sunburst', family: 'hierarchy' },
  { id: 'tree-horizontal', family: 'hierarchy' },
  { id: 'tree-radial', family: 'hierarchy' },
  { id: 'graph', family: 'hierarchy' },
  { id: 'sankey', family: 'flow' },
  { id: 'funnel', family: 'flow' },
  { id: 'funnel-compare', family: 'flow' },
  { id: 'graph-circular', family: 'flow' },
  { id: 'gauge', family: 'monitoring' },
  { id: 'semicircle-gauge', family: 'monitoring' },
  { id: 'multi-gauge', family: 'monitoring' },
  { id: 'radar', family: 'monitoring' },
  { id: 'radar-filled', family: 'monitoring' },
  { id: 'polar-bar', family: 'monitoring' },
] as const satisfies ReadonlyArray<{ id: string; family: ChartFamily }>

export type GalleryChartId = (typeof CHART_GALLERY)[number]['id']

export interface GalleryChartContext {
  palette: string[]
  foreground: string
  mutedForeground: string
  border: string
  surface: string
  fontFamily: string
  t: (key: string) => string
}

export interface GalleryChartData {
  option: EChartsOption
  dataColumns: string[]
  dataRows: Array<{ label: string; values: Array<string | number> }>
}

type Label = (key: string) => string

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun'] as const
const REGION_KEYS = ['north', 'south', 'east', 'west', 'central'] as const
const CHANNEL_KEYS = ['direct', 'search', 'referral', 'social', 'email'] as const
const REVENUE = [42, 51, 47, 68, 76, 91]
const ORDERS = [120, 145, 132, 190, 208, 246]
const SEGMENTS = [
  { name: 'enterprise', values: [24, 28, 26, 34, 38, 46] },
  { name: 'business', values: [12, 16, 15, 24, 26, 30] },
  { name: 'starter', values: [6, 7, 6, 10, 12, 15] },
] as const
const CHANNEL_VALUES = [38, 27, 17, 11, 7]
const SCATTER_POINTS = [
  [12, 18, 24],
  [18, 22, 34],
  [24, 35, 42],
  [31, 32, 28],
  [39, 46, 52],
  [46, 44, 38],
  [54, 61, 68],
  [63, 64, 48],
  [72, 79, 76],
  [84, 82, 58],
] as const

function rows(categories: string[], columns: ReadonlyArray<ReadonlyArray<number | string>>) {
  return categories.map((label, index) => ({
    label,
    values: columns.map((column) => column[index] ?? ''),
  }))
}

function result(
  base: EChartsOption,
  option: EChartsOption,
  dataColumns: string[],
  dataRows: GalleryChartData['dataRows'],
): GalleryChartData {
  return { option: { ...base, ...option }, dataColumns, dataRows }
}

/**
 * Sample data and its accessible table are built together. There is no random
 * input, locale-sensitive parsing or independent "summary" dataset to drift.
 * Options consume resolved semantic colours; they do not know the active theme.
 */
export function buildGalleryChart(
  id: GalleryChartId,
  context: GalleryChartContext,
): GalleryChartData {
  const l: Label = (key) => context.t(`chart_gallery_label_${key}`)
  const color = (index: number) =>
    context.palette[index % context.palette.length] ?? context.foreground
  const months = MONTH_KEYS.map(l)
  const regions = REGION_KEYS.map(l)
  const channels = CHANNEL_KEYS.map(l)
  const tooltip = {
    confine: true,
    backgroundColor: context.surface,
    borderColor: context.border,
    textStyle: { color: context.foreground, fontFamily: context.fontFamily },
  }
  const base: EChartsOption = {
    animation: false,
    color: [...context.palette],
    textStyle: { fontFamily: context.fontFamily, color: context.foreground },
    tooltip,
  }
  const legend = {
    bottom: 0,
    type: 'scroll' as const,
    textStyle: { color: context.mutedForeground, fontFamily: context.fontFamily },
    itemWidth: 12,
    itemHeight: 8,
  }
  const grid = { top: 28, right: 18, bottom: 48, left: 12, containLabel: true }
  const categoryAxis = (data: string[]) => ({
    type: 'category' as const,
    data,
    axisTick: { show: false },
    axisLine: { lineStyle: { color: context.border } },
    axisLabel: { color: context.mutedForeground, fontSize: 10, hideOverlap: true },
  })
  const valueAxis = (name?: string) => ({
    type: 'value' as const,
    name,
    nameTextStyle: { color: context.mutedForeground, fontSize: 10 },
    axisLabel: { color: context.mutedForeground, fontSize: 10 },
    splitLine: { lineStyle: { color: context.border, type: 'dashed' as const } },
  })
  const cartesian = {
    grid,
    xAxis: categoryAxis(months),
    yAxis: valueAxis(),
    tooltip: { ...tooltip, trigger: 'axis' as const },
  }
  const makeLine = (name: string, data: ReadonlyArray<number>): LineSeriesOption => ({
    name: l(name),
    type: 'line',
    data: [...data],
    symbolSize: 6,
    lineStyle: { width: 2 },
    emphasis: { focus: 'series' },
  })
  const makeBar = (name: string, data: ReadonlyArray<number>): BarSeriesOption => ({
    name: l(name),
    type: 'bar',
    data: [...data],
    barMaxWidth: 32,
    emphasis: { focus: 'series' },
  })

  if (['line', 'smooth-line', 'step-line', 'area'].includes(id)) {
    const line = makeLine('revenue', REVENUE)
    if (id === 'smooth-line') line.smooth = true
    if (id === 'step-line') line.step = 'end'
    if (id === 'area') line.areaStyle = { opacity: 0.18 }
    return result(
      base,
      { ...cartesian, series: [line] },
      [l('month'), l('revenue')],
      rows(months, [REVENUE]),
    )
  }

  if (['stacked-area', 'percent-area', 'multi-line'].includes(id)) {
    const percent = id === 'percent-area'
    const values = SEGMENTS.map((segment) =>
      segment.values.map((value, index) =>
        percent ? Math.round((value / REVENUE[index]!) * 1000) / 10 : value,
      ),
    )
    // Make the final percentage a remainder, so each column adds to exactly 100.
    if (percent)
      values[2] = REVENUE.map(
        (_, index) => Math.round((100 - values[0]![index]! - values[1]![index]!) * 10) / 10,
      )
    const series = SEGMENTS.map((segment, index): LineSeriesOption => ({
      ...makeLine(segment.name, values[index]!),
      ...(id === 'multi-line'
        ? { lineStyle: { width: 2, type: (['solid', 'dashed', 'dotted'] as const)[index] } }
        : { stack: 'segments', areaStyle: { opacity: 0.48 }, symbol: 'none' }),
    }))
    return result(
      base,
      {
        ...cartesian,
        legend,
        yAxis: {
          ...valueAxis(),
          ...(percent
            ? { max: 100, axisLabel: { color: context.mutedForeground, formatter: '{value}%' } }
            : {}),
        },
        series,
      },
      [l('month'), ...SEGMENTS.map((segment) => l(segment.name))],
      rows(months, values),
    )
  }

  if (id === 'dual-axis') {
    return result(
      base,
      {
        ...cartesian,
        grid: { ...grid, right: 22 },
        legend,
        yAxis: [valueAxis(l('revenue')), { ...valueAxis(l('orders')), splitLine: { show: false } }],
        series: [makeBar('revenue', REVENUE), { ...makeLine('orders', ORDERS), yAxisIndex: 1 }],
      },
      [l('month'), l('revenue'), l('orders')],
      rows(months, [REVENUE, ORDERS]),
    )
  }

  if (
    [
      'column',
      'horizontal-bar',
      'grouped-column',
      'stacked-column',
      'grouped-bar',
      'percent-bar',
    ].includes(id)
  ) {
    const horizontal = ['horizontal-bar', 'grouped-bar', 'percent-bar'].includes(id)
    const single = id === 'column' || id === 'horizontal-bar'
    const percent = id === 'percent-bar'
    const stacked = id === 'stacked-column' || percent
    const categories = regions
    const raw = [
      [48, 36, 57, 41, 29],
      [32, 44, 23, 39, 51],
    ]
    const values = percent
      ? raw.map((list, seriesIndex) =>
          list.map((value, index) =>
            seriesIndex === 0
              ? Math.round((value / (raw[0]![index]! + raw[1]![index]!)) * 1000) / 10
              : Math.round(
                  (100 - Math.round((raw[0]![index]! / (raw[0]![index]! + value)) * 1000) / 10) *
                    10,
                ) / 10,
          ),
        )
      : raw
    const selected = single ? [values[0]!] : values
    return result(
      base,
      {
        grid,
        legend: single ? undefined : legend,
        tooltip: { ...tooltip, trigger: 'axis' },
        xAxis: horizontal
          ? {
              ...valueAxis(),
              ...(percent
                ? { max: 100, axisLabel: { color: context.mutedForeground, formatter: '{value}%' } }
                : {}),
            }
          : categoryAxis(categories),
        yAxis: horizontal ? categoryAxis(categories) : valueAxis(),
        series: selected.map((data, index): BarSeriesOption => ({
          ...makeBar(index === 0 ? 'new_customers' : 'returning', data),
          ...(stacked ? { stack: 'customers' } : {}),
        })),
      },
      [l('region'), ...(single ? [l('new_customers')] : [l('new_customers'), l('returning')])],
      rows(categories, selected),
    )
  }

  if (id === 'diverging-bar') {
    const additions = [32, 48, 39, 56, 44]
    const refunds = [-12, -19, -9, -16, -11]
    return result(
      base,
      {
        grid,
        legend,
        xAxis: valueAxis(),
        yAxis: categoryAxis(regions),
        tooltip: { ...tooltip, trigger: 'axis' },
        series: [
          { ...makeBar('additions', additions), stack: 'net' },
          { ...makeBar('refunds', refunds), stack: 'net' },
        ],
      },
      [l('region'), l('additions'), l('refunds')],
      rows(regions, [additions, refunds]),
    )
  }

  if (id === 'waterfall') {
    const categories = ['start', 'additions', 'refunds', 'costs', 'finish'].map(l)
    const changes = [120, 48, -18, -26, 124]
    const totals = [120, 168, 150, 124, 124]
    const bases = [0, 120, 150, 124, 0]
    return result(
      base,
      {
        grid,
        xAxis: categoryAxis(categories),
        yAxis: valueAxis(),
        series: [
          {
            type: 'bar',
            stack: 'waterfall',
            silent: true,
            itemStyle: { color: 'transparent' },
            emphasis: { disabled: true },
            tooltip: { show: false },
            data: bases,
          },
          {
            type: 'bar',
            name: l('change'),
            stack: 'waterfall',
            barMaxWidth: 36,
            data: changes.map((value, index) => ({
              value: Math.abs(value),
              itemStyle: { color: color(value < 0 ? 1 : index === 4 ? 2 : 0) },
            })),
            label: {
              show: true,
              position: 'top',
              color: context.foreground,
              formatter: ({ dataIndex }) => String(changes[dataIndex]),
            },
          },
        ],
      },
      [l('stage'), l('change'), l('total')],
      rows(categories, [changes, totals]),
    )
  }

  if (id === 'lollipop') {
    const values = [48, 36, 57, 41, 29]
    return result(
      base,
      {
        grid,
        xAxis: valueAxis(),
        yAxis: categoryAxis(regions),
        series: [
          {
            type: 'bar',
            name: l('value'),
            data: values,
            barWidth: 3,
            itemStyle: { color: color(0) },
            tooltip: { show: false },
          },
          {
            type: 'scatter',
            name: l('value'),
            data: values.map((value, index) => [value, index]),
            symbolSize: 13,
            itemStyle: { color: color(0) },
          },
        ],
      },
      [l('region'), l('value')],
      rows(regions, [values]),
    )
  }

  if (id === 'pictorial-bar') {
    const values = [12, 8, 16, 10, 6]
    return result(
      base,
      {
        grid,
        xAxis: categoryAxis(regions),
        yAxis: valueAxis(),
        series: [
          {
            type: 'pictorialBar',
            name: l('orders'),
            data: values,
            symbol: 'roundRect',
            symbolRepeat: true,
            symbolSize: [18, 6],
            symbolMargin: 2,
            symbolBoundingData: 18,
            itemStyle: { color: color(0) },
          },
        ],
      },
      [l('region'), l('orders')],
      rows(regions, [values]),
    )
  }

  if (
    ['pie', 'donut', 'rose-radius', 'rose-area', 'nested-donut', 'semicircle-donut'].includes(id)
  ) {
    const data = channels.map((name, index) => ({ name, value: CHANNEL_VALUES[index]! }))
    const pie: PieSeriesOption = {
      type: 'pie',
      name: l('share'),
      data,
      radius: id === 'pie' ? '68%' : ['40%', '68%'],
      center: ['50%', '46%'],
      label: { show: false },
      itemStyle: { borderColor: context.surface, borderWidth: 2 },
      emphasis: { label: { show: true, color: context.foreground, formatter: '{b}\n{d}%' } },
    }
    if (id === 'rose-radius' || id === 'rose-area') {
      pie.roseType = id === 'rose-radius' ? 'radius' : 'area'
      pie.radius = ['16%', '70%']
    }
    if (id === 'semicircle-donut') {
      pie.startAngle = 180
      pie.endAngle = 0
      pie.center = ['50%', '62%']
      pie.radius = ['52%', '83%']
    }
    if (id === 'nested-donut') {
      const segments = [
        { name: l('new_customers'), value: 65 },
        { name: l('returning'), value: 35 },
      ]
      return result(
        base,
        {
          legend,
          series: [
            { ...pie, name: l('customers'), radius: ['20%', '39%'], data: segments },
            { ...pie, radius: ['47%', '70%'] },
          ],
        },
        [l('category'), l('amount')],
        [
          ...data.map(({ name, value }) => ({ label: `${l('source')}: ${name}`, values: [value] })),
          ...segments.map(({ name, value }) => ({
            label: `${l('customers')}: ${name}`,
            values: [value],
          })),
        ],
      )
    }
    return result(
      base,
      { legend, series: [pie] },
      [l('source'), l('share')],
      rows(channels, [CHANNEL_VALUES]),
    )
  }

  if (id === 'histogram') {
    const buckets = ['0–9', '10–19', '20–29', '30–39', '40–49', '50–59', '60–69', '70–79']
    const counts = [4, 9, 18, 28, 24, 15, 8, 3]
    return result(
      base,
      {
        grid,
        xAxis: categoryAxis(buckets),
        yAxis: valueAxis(l('count')),
        series: [{ ...makeBar('count', counts), barCategoryGap: '3%', barMaxWidth: undefined }],
      },
      [l('value'), l('count')],
      rows(buckets, [counts]),
    )
  }

  if (id === 'boxplot' || id === 'horizontal-boxplot') {
    const samples = [
      [12, 22, 31, 43, 56],
      [18, 28, 39, 48, 62],
      [8, 19, 29, 38, 52],
      [22, 34, 45, 59, 72],
      [16, 26, 36, 47, 61],
    ]
    const horizontal = id === 'horizontal-boxplot'
    return result(
      base,
      {
        grid,
        xAxis: horizontal ? valueAxis() : categoryAxis(regions),
        yAxis: horizontal ? categoryAxis(regions) : valueAxis(),
        series: [
          {
            type: 'boxplot',
            name: l('value'),
            data: samples,
            itemStyle: { color: context.surface, borderColor: color(0), borderWidth: 2 },
          },
        ],
      },
      [l('region'), ...['minimum', 'lower_quartile', 'median', 'upper_quartile', 'maximum'].map(l)],
      regions.map((label, index) => ({ label, values: samples[index]! })),
    )
  }

  if (id === 'candlestick') {
    const samples = [
      [40, 46, 37, 49],
      [46, 43, 41, 52],
      [43, 51, 40, 54],
      [51, 57, 48, 60],
      [57, 53, 50, 62],
      [53, 65, 51, 68],
    ]
    return result(
      base,
      {
        ...cartesian,
        series: [
          {
            type: 'candlestick',
            name: l('value'),
            data: samples,
            itemStyle: {
              color: color(0),
              color0: context.surface,
              borderColor: color(0),
              borderColor0: color(1),
            },
          },
        ],
      },
      [l('month'), ...['open', 'close', 'low', 'high'].map(l)],
      months.map((label, index) => ({ label, values: samples[index]! })),
    )
  }

  if (id === 'heatmap') {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri'].map(l)
    const hours = ['08', '10', '12', '14', '16', '18']
    const data = days.flatMap((_, day) =>
      hours.map((__, hour) => [hour, day, (((day + 2) * (hour + 3) * 7) % 49) + 4]),
    )
    return result(
      base,
      {
        grid: { top: 14, right: 12, bottom: 62, left: 12, containLabel: true },
        xAxis: { ...categoryAxis(hours), splitArea: { show: true } },
        yAxis: categoryAxis(days),
        visualMap: {
          min: 0,
          max: 55,
          calculable: false,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          itemWidth: 12,
          itemHeight: 100,
          inRange: { color: [color(0), color(0)], colorAlpha: [0.12, 1] },
          textStyle: { color: context.mutedForeground },
        },
        series: [
          {
            type: 'heatmap',
            name: l('orders'),
            data,
            itemStyle: { borderWidth: 2, borderColor: context.surface },
            label: { show: false },
          },
        ],
      },
      [l('day'), l('hour'), l('orders')],
      data.map(([hour, day, count]) => ({
        label: `${days[day!]} · ${hours[hour!]}:00`,
        values: [`${hours[hour!]}:00`, count!],
      })),
    )
  }

  if (id === 'calendar-heatmap') {
    const data: Array<[string, number]> = Array.from({ length: 30 }, (_, index) => [
      `2026-06-${String(index + 1).padStart(2, '0')}`,
      (((index + 4) * 17) % 61) + 8,
    ])
    return result(
      base,
      {
        calendar: {
          range: '2026-06',
          top: 30,
          left: 40,
          right: 16,
          bottom: 62,
          cellSize: ['auto', 'auto'],
          yearLabel: { show: false },
          monthLabel: { show: false },
          dayLabel: {
            firstDay: 1,
            nameMap: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(l),
            color: context.mutedForeground,
            fontSize: 10,
          },
          splitLine: { show: false },
          itemStyle: { color: context.surface, borderColor: context.border, borderWidth: 1 },
        },
        visualMap: {
          min: 0,
          max: 70,
          calculable: false,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          itemWidth: 12,
          itemHeight: 100,
          inRange: { color: [color(0), color(0)], colorAlpha: [0.12, 1] },
          textStyle: { color: context.mutedForeground },
        },
        series: [{ type: 'heatmap', coordinateSystem: 'calendar', name: l('orders'), data }],
      },
      [l('date'), l('orders')],
      data.map(([label, count]) => ({ label, values: [count] })),
    )
  }

  if (
    ['scatter', 'bubble', 'effect-scatter', 'scatter-regression', 'quadrant-scatter'].includes(id)
  ) {
    const points = SCATTER_POINTS.map((point) => [...point])
    const scatter: ScatterSeriesOption = {
      type: 'scatter',
      name: l('customers'),
      data: points,
      symbolSize: 9,
      itemStyle: { opacity: 0.8 },
    }
    if (id === 'bubble') scatter.symbolSize = (value: number[]) => Math.sqrt(value[2]!) * 3
    if (id === 'quadrant-scatter') {
      scatter.markLine = {
        silent: true,
        symbol: 'none',
        label: { show: false },
        lineStyle: { color: context.mutedForeground, type: 'dashed' },
        data: [{ xAxis: 50 }, { yAxis: 50 }],
      }
    }
    // Ordinary least squares, derived from the same sample points as the table.
    const meanX = points.reduce((sum, point) => sum + point[0]!, 0) / points.length
    const meanY = points.reduce((sum, point) => sum + point[1]!, 0) / points.length
    const slope =
      points.reduce((sum, point) => sum + (point[0]! - meanX) * (point[1]! - meanY), 0) /
      points.reduce((sum, point) => sum + (point[0]! - meanX) ** 2, 0)
    const intercept = meanY - slope * meanX
    const fitted = points.map((point) => Math.round((slope * point[0]! + intercept) * 100) / 100)
    const series: EChartsOption['series'] =
      id === 'effect-scatter'
        ? [
            {
              type: 'effectScatter',
              name: l('customers'),
              data: points,
              symbolSize: 11,
              showEffectOn: 'emphasis',
              rippleEffect: { scale: 2, brushType: 'stroke' },
            },
          ]
        : [
            scatter,
            ...(id === 'scatter-regression'
              ? [
                  {
                    type: 'line' as const,
                    name: l('regression'),
                    data: points.map((point, index) => [point[0]!, fitted[index]!]),
                    showSymbol: false,
                    lineStyle: { type: 'dashed' as const, width: 2 },
                    itemStyle: { color: color(1) },
                  },
                ]
              : []),
          ]
    return result(
      base,
      {
        grid: { ...grid, bottom: 38 },
        xAxis: { ...valueAxis(l('spend')), min: 0, max: 100 },
        yAxis: { ...valueAxis(l('conversion')), min: 0, max: 100 },
        series,
      },
      [
        l('customers'),
        l('spend'),
        l('conversion'),
        l('orders'),
        ...(id === 'scatter-regression' ? [l('regression')] : []),
      ],
      points.map((point, index) => ({
        label: `${l('customers')} ${index + 1}`,
        values: [
          point[0]!,
          point[1]!,
          point[2]!,
          ...(id === 'scatter-regression' ? [fitted[index]!] : []),
        ],
      })),
    )
  }

  if (id === 'parallel') {
    const dimensions = ['speed', 'quality', 'support', 'security'].map(l)
    const samples = [
      [72, 90, 86, 82],
      [88, 76, 68, 91],
      [64, 86, 92, 78],
      [82, 82, 80, 88],
    ]
    const names = ['design', 'engineering', 'sales', 'operations'].map(l)
    return result(
      base,
      {
        parallel: {
          left: 28,
          right: 28,
          top: 34,
          bottom: 32,
          parallelAxisDefault: {
            type: 'value',
            min: 0,
            max: 100,
            nameTextStyle: { color: context.mutedForeground, fontSize: 10 },
            axisLabel: { color: context.mutedForeground, fontSize: 9 },
            axisLine: { lineStyle: { color: context.border } },
            splitLine: { show: false },
          },
        },
        parallelAxis: dimensions.map((name, dim) => ({ dim, name })),
        series: [
          {
            type: 'parallel',
            name: l('score'),
            lineStyle: { width: 2, opacity: 0.65 },
            data: samples.map((value, index) => ({
              name: names[index],
              value,
              lineStyle: { color: color(index) },
            })),
          },
        ],
      },
      [l('category'), ...dimensions],
      names.map((label, index) => ({ label, values: samples[index]! })),
    )
  }

  if (
    ['treemap', 'nested-treemap', 'sunburst', 'tree-horizontal', 'tree-radial', 'graph'].includes(
      id,
    )
  ) {
    return buildHierarchyChart(id, context, base, l, color)
  }

  if (id === 'sankey') {
    const names = ['direct', 'search', 'social', 'leads', 'qualified', 'won'].map(l)
    const links = [
      { source: names[0]!, target: names[3]!, value: 42 },
      { source: names[1]!, target: names[3]!, value: 35 },
      { source: names[2]!, target: names[3]!, value: 23 },
      { source: names[3]!, target: names[4]!, value: 64 },
      { source: names[4]!, target: names[5]!, value: 38 },
    ]
    return result(
      base,
      {
        series: [
          {
            type: 'sankey',
            left: 8,
            top: 28,
            right: 52,
            bottom: 24,
            nodeWidth: 12,
            nodeGap: 20,
            data: names.map((name) => ({ name })),
            links,
            label: { color: context.foreground, fontSize: 10 },
            lineStyle: { color: 'source', opacity: 0.25, curveness: 0.5 },
            emphasis: { focus: 'adjacency' },
          },
        ],
      },
      [l('source'), l('target'), l('value')],
      links.map((link) => ({ label: link.source, values: [link.target, link.value] })),
    )
  }

  if (id === 'funnel' || id === 'funnel-compare') {
    const stages = ['views', 'leads', 'qualified', 'proposal', 'won'].map(l)
    const actual = [100, 72, 48, 30, 18]
    const target = [100, 82, 60, 42, 28]
    return result(
      base,
      {
        legend:
          id === 'funnel-compare'
            ? { ...legend, data: [l('actual'), l('target_value')] }
            : undefined,
        series:
          id === 'funnel'
            ? [
                {
                  type: 'funnel',
                  left: '12%',
                  right: '12%',
                  top: 18,
                  bottom: 24,
                  gap: 3,
                  minSize: '10%',
                  label: {
                    position: 'inside',
                    color: context.foreground,
                    backgroundColor: context.surface,
                    padding: [2, 4],
                    borderRadius: 2,
                    formatter: '{b}',
                    fontSize: 10,
                  },
                  itemStyle: { borderColor: context.surface },
                  data: stages.map((name, index) => ({ name, value: actual[index]! })),
                },
              ]
            : [
                {
                  type: 'funnel',
                  name: l('target_value'),
                  left: '9%',
                  right: '9%',
                  top: 18,
                  bottom: 42,
                  gap: 3,
                  label: { show: false },
                  itemStyle: { color: color(1), opacity: 0.2, borderColor: context.surface },
                  data: stages.map((name, index) => ({ name, value: target[index]! })),
                },
                {
                  type: 'funnel',
                  name: l('actual'),
                  left: '23%',
                  right: '23%',
                  top: 18,
                  bottom: 42,
                  gap: 3,
                  maxSize: '100%',
                  label: {
                    position: 'inside',
                    color: context.foreground,
                    backgroundColor: context.surface,
                    padding: [2, 4],
                    borderRadius: 2,
                    formatter: '{b}',
                    fontSize: 10,
                  },
                  itemStyle: { color: color(0), borderColor: context.surface },
                  data: stages.map((name, index) => ({ name, value: actual[index]! })),
                },
              ],
      },
      [l('stage'), l('actual'), ...(id === 'funnel-compare' ? [l('target_value')] : [])],
      rows(stages, id === 'funnel' ? [actual] : [actual, target]),
    )
  }

  if (id === 'graph-circular') {
    const names = ['design', 'engineering', 'sales', 'operations', 'support', 'security'].map(l)
    const links = names.map((name, index) => ({
      source: name,
      target: names[(index + 1) % names.length]!,
      value: [12, 18, 9, 15, 11, 8][index]!,
    }))
    links.push(
      { source: names[0]!, target: names[3]!, value: 6 },
      { source: names[1]!, target: names[4]!, value: 10 },
    )
    return result(
      base,
      {
        series: [
          {
            type: 'graph',
            layout: 'circular',
            circular: { rotateLabel: false },
            roam: false,
            left: 46,
            right: 46,
            top: 42,
            bottom: 42,
            symbolSize: 26,
            data: names.map((name, index) => ({ name, itemStyle: { color: color(index) } })),
            links,
            label: { show: true, position: 'bottom', color: context.foreground, fontSize: 10 },
            lineStyle: {
              color: context.mutedForeground,
              width: 1.5,
              curveness: 0.15,
              opacity: 0.5,
            },
          },
        ],
      },
      [l('source'), l('target'), l('value')],
      links.map((link) => ({
        label: `${link.source} → ${link.target}`,
        values: [link.target, link.value],
      })),
    )
  }

  if (['gauge', 'semicircle-gauge', 'multi-gauge'].includes(id)) {
    const values = id === 'multi-gauge' ? [72, 86, 63] : [72]
    const names = id === 'multi-gauge' ? ['speed', 'quality', 'support'].map(l) : [l('capacity')]
    return result(
      base,
      {
        series: values.map((value, index) => ({
          type: 'gauge' as const,
          center: [
            id === 'multi-gauge' ? `${18 + index * 32}%` : '50%',
            id === 'semicircle-gauge' ? '68%' : '56%',
          ],
          radius: id === 'multi-gauge' ? '43%' : '78%',
          startAngle: id === 'semicircle-gauge' ? 180 : 225,
          endAngle: id === 'semicircle-gauge' ? 0 : -45,
          min: 0,
          max: 100,
          axisLine: {
            lineStyle: { width: id === 'multi-gauge' ? 8 : 14, color: [[1, context.border]] },
          },
          progress: {
            show: true,
            width: id === 'multi-gauge' ? 8 : 14,
            itemStyle: { color: color(index) },
          },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          pointer: { show: false },
          title: { offsetCenter: [0, '44%'], fontSize: 10, color: context.mutedForeground },
          detail: {
            valueAnimation: false,
            offsetCenter: [0, '0%'],
            fontSize: id === 'multi-gauge' ? 23 : 36,
            formatter: '{value}%',
            color: context.foreground,
          },
          data: [{ name: names[index], value }],
        })),
      },
      [l('dimension'), l('used'), l('available')],
      names.map((label, index) => ({ label, values: [values[index]!, 100 - values[index]!] })),
    )
  }

  if (id === 'radar' || id === 'radar-filled') {
    const dimensions = ['speed', 'quality', 'support', 'security', 'retention'].map(l)
    const actual = [78, 90, 74, 86, 82]
    const target = [88, 84, 90, 82, 92]
    return result(
      base,
      {
        legend,
        radar: {
          center: ['50%', '46%'],
          radius: '64%',
          indicator: dimensions.map((name) => ({ name, max: 100 })),
          axisName: { color: context.mutedForeground, fontSize: 10 },
          axisLine: { lineStyle: { color: context.border } },
          splitLine: { lineStyle: { color: context.border } },
          splitArea: { show: false },
        },
        series: [
          {
            type: 'radar',
            data: [
              {
                name: l('actual'),
                value: actual,
                areaStyle: { opacity: id === 'radar-filled' ? 0.2 : 0 },
                lineStyle: { width: 2 },
              },
              {
                name: l('target_value'),
                value: target,
                lineStyle: { width: 2, type: 'dashed' },
                areaStyle: { opacity: id === 'radar-filled' ? 0.1 : 0 },
              },
            ],
          },
        ],
      },
      [l('dimension'), l('actual'), l('target_value')],
      rows(dimensions, [actual, target]),
    )
  }

  const dimensions = ['speed', 'quality', 'support', 'security', 'retention'].map(l)
  const values = [72, 88, 64, 82, 76]
  return result(
    base,
    {
      polar: { radius: ['12%', '72%'], center: ['50%', '50%'] },
      angleAxis: {
        ...valueAxis(),
        max: 100,
        startAngle: 90,
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: context.border } },
      },
      radiusAxis: {
        ...categoryAxis(dimensions),
        axisLine: { show: false },
        axisLabel: { color: context.mutedForeground, fontSize: 9 },
      },
      series: [
        {
          type: 'bar',
          coordinateSystem: 'polar',
          name: l('score'),
          data: values.map((value, index) => ({ value, itemStyle: { color: color(index) } })),
          roundCap: true,
          barWidth: 12,
        },
      ],
    },
    [l('dimension'), l('score')],
    rows(dimensions, [values]),
  )
}

function buildHierarchyChart(
  id: GalleryChartId,
  context: GalleryChartContext,
  base: EChartsOption,
  l: Label,
  color: (index: number) => string,
): GalleryChartData {
  const groups = [
    {
      name: l('engineering'),
      children: [
        { name: l('security'), value: 24 },
        { name: l('quality'), value: 18 },
      ],
    },
    {
      name: l('sales'),
      children: [
        { name: l('enterprise'), value: 28 },
        { name: l('business'), value: 16 },
      ],
    },
    {
      name: l('operations'),
      children: [
        { name: l('support'), value: 20 },
        { name: l('design'), value: 14 },
      ],
    },
  ].map((group, index) => ({
    ...group,
    value: group.children.reduce((sum, child) => sum + child.value, 0),
    itemStyle: { color: color(index) },
  }))
  const flat = groups.flatMap((group) =>
    group.children.map((child) => ({ ...child, parent: group.name })),
  )
  const tree = {
    name: l('total'),
    value: groups.reduce((sum, group) => sum + group.value, 0),
    children: groups,
  }
  const table = [
    { label: tree.name, values: ['', tree.value] },
    ...groups.flatMap((group) => [
      { label: group.name, values: [tree.name, group.value] },
      ...group.children.map((child) => ({ label: child.name, values: [group.name, child.value] })),
    ]),
  ]
  const columns = [l('category'), l('parent'), l('value')]
  if (id === 'treemap' || id === 'nested-treemap') {
    const nested = id === 'nested-treemap'
    return result(
      base,
      {
        series: [
          {
            type: 'treemap',
            left: 4,
            right: 4,
            top: 8,
            bottom: 8,
            roam: false,
            nodeClick: false,
            breadcrumb: { show: false },
            data: nested ? groups : flat.map(({ name, value }) => ({ name, value })),
            label: {
              show: true,
              color: context.foreground,
              fontSize: 11,
              backgroundColor: context.surface,
              padding: [2, 3],
              borderRadius: 2,
            },
            upperLabel: {
              show: nested,
              height: 22,
              color: context.foreground,
              fontSize: 10,
              backgroundColor: context.surface,
              padding: [2, 3],
            },
            itemStyle: { borderColor: context.surface, borderWidth: 3, gapWidth: 3 },
            levels: [
              {},
              { itemStyle: { borderColor: context.surface, borderWidth: 4, gapWidth: 3 } },
              { colorSaturation: [0.35, 0.7], itemStyle: { gapWidth: 2 } },
            ],
          },
        ],
      },
      nested ? columns : [l('category'), l('value')],
      nested ? table : flat.map(({ name, value }) => ({ label: name, values: [value] })),
    )
  }
  if (id === 'sunburst') {
    return result(
      base,
      {
        series: [
          {
            type: 'sunburst',
            data: groups,
            radius: ['12%', '90%'],
            nodeClick: false,
            sort: undefined,
            label: {
              color: context.foreground,
              fontSize: 10,
              rotate: 'radial',
              backgroundColor: context.surface,
              padding: [1, 2],
            },
            itemStyle: { borderColor: context.surface, borderWidth: 2 },
          },
        ],
      },
      columns,
      table,
    )
  }
  if (id === 'tree-horizontal' || id === 'tree-radial') {
    const radial = id === 'tree-radial'
    return result(
      base,
      {
        series: [
          {
            type: 'tree',
            data: [tree],
            top: radial ? '16%' : '10%',
            left: radial ? '16%' : '14%',
            bottom: radial ? '16%' : '10%',
            right: radial ? '16%' : '24%',
            layout: radial ? 'radial' : 'orthogonal',
            orient: 'LR',
            symbolSize: 7,
            initialTreeDepth: -1,
            expandAndCollapse: false,
            roam: false,
            label: {
              color: context.foreground,
              fontSize: 10,
              position: radial ? 'right' : 'left',
              verticalAlign: 'middle',
              align: radial ? 'left' : 'right',
            },
            leaves: { label: { position: 'right', align: 'left' } },
            lineStyle: { color: context.border, width: 2 },
            itemStyle: { color: color(0), borderColor: context.surface },
          },
        ],
      },
      columns,
      table,
    )
  }
  const nodes = [
    {
      name: tree.name,
      value: tree.value,
      x: 0,
      y: 0,
      symbolSize: 32,
      itemStyle: { color: color(0) },
    },
    ...groups.flatMap((group, index) => [
      {
        name: group.name,
        value: group.value,
        x: [-110, 0, 110][index]!,
        y: 75,
        symbolSize: 23,
        itemStyle: { color: color(index + 1) },
      },
      ...group.children.map((child, childIndex) => ({
        name: child.name,
        value: child.value,
        x: [-110, 0, 110][index]! + (childIndex === 0 ? -28 : 28),
        y: 155,
        symbolSize: 15,
        itemStyle: { color: color(index + 1) },
      })),
    ]),
  ]
  const links = groups.flatMap((group) => [
    { source: tree.name, target: group.name },
    ...group.children.map((child) => ({ source: group.name, target: child.name })),
  ])
  return result(
    base,
    {
      series: [
        {
          type: 'graph',
          layout: 'none',
          left: 28,
          right: 28,
          top: 36,
          bottom: 42,
          roam: false,
          data: nodes,
          links,
          label: { show: true, color: context.foreground, position: 'bottom', fontSize: 9 },
          lineStyle: { color: context.mutedForeground, width: 1.5, opacity: 0.5 },
        },
      ],
    },
    columns,
    table,
  )
}
