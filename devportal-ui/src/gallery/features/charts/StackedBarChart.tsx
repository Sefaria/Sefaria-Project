import {
  Bar,
  ComposedChart,
  CartesianGrid,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AXIS_LINE, AXIS_TICK, CHART_HEIGHT, GRID_STROKE, shortMonth } from './chartTheme';

export interface Series {
  key: string;
  label: string;
  color: string;
}

interface Row {
  month: string;
  total: number;
}

interface StackedBarChartProps {
  rows: readonly Row[];
  /** Bottom to top. */
  series: readonly Series[];
  ariaLabel: string;
}

interface SegmentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  dataKey?: string;
  payload?: Record<string, unknown>;
}

const RADIUS = 4;

/** A stacked segment: only the topmost non-empty one gets rounded data ends. */
function renderSegment(
  { x = 0, y = 0, width = 0, height = 0, fill, dataKey, payload }: SegmentProps,
  order: readonly string[]
) {
  if (height <= 0 || width <= 0) return <g />;
  const top = [...order].reverse().find((k) => Number(payload?.[k]) > 0);
  if (dataKey !== top) return <rect x={x} y={y} width={width} height={height} fill={fill} />;
  const r = Math.min(RADIUS, width / 2, height);
  const d = `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
  return <path d={d} fill={fill} />;
}

/** Monthly stacked bars with a 2px gap between segments and month totals above the bars. */
export function StackedBarChart({ rows, series, ariaLabel }: StackedBarChartProps) {
  const data = rows;
  const order = series.map((s) => s.key);
  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ComposedChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis
            dataKey="month"
            tickFormatter={shortMonth}
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis allowDecimals={false} width={32} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip cursor={false} />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="stack"
              fill={s.color}
              stroke="var(--surface-page)"
              strokeWidth={1}
              shape={(props: SegmentProps) => renderSegment(props, order)}
              isAnimationActive={false}
            />
          ))}
          {/* Invisible line through the stack tops, carrying the month totals. */}
          <Line
            dataKey="total"
            stroke="none"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            legendType="none"
            tooltipType="none"
          >
            <LabelList
              dataKey="total"
              position="top"
              formatter={(v: unknown) => (Number(v) > 0 ? String(v) : '')}
              style={{ ...AXIS_TICK, fill: 'var(--text-primary)' }}
            />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
