import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { YearRow } from './selectors';
import { AXIS_LINE, AXIS_TICK, BAR_FILL, BAR_FILL_HOVER, CHART_HEIGHT, GRID_STROKE, shortYear } from './chartTheme';

export function YearBarChart({ rows, ariaLabel }: { rows: readonly YearRow[]; ariaLabel: string }) {
  const data = rows.map((r) => ({ ...r, label: shortYear(r.year) }));
  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
          <YAxis allowDecimals={false} width={32} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={false}
            formatter={(value) => [value, 'Projects']}
            labelFormatter={(_, p) => p[0]?.payload.year}
          />
          <Bar
            dataKey="count"
            fill={BAR_FILL}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            activeBar={{ fill: BAR_FILL_HOVER }}
          >
            <LabelList dataKey="count" position="top" style={{ ...AXIS_TICK, fill: 'var(--text-primary)' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
