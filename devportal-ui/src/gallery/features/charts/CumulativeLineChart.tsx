import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChartNote } from './chartNotes';
import type { CumulativeRow } from './selectors';
import { AXIS_LINE, AXIS_TICK, CHART_HEIGHT, GRID_STROKE, shortYear } from './chartTheme';

interface CumulativeLineChartProps {
  rows: readonly CumulativeRow[];
  notes: readonly ChartNote[];
  ariaLabel: string;
}

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: { year: number; total: number };
}

/**
 * Cumulative line. Annotations are numbered markers on the line; the notes
 * themselves are listed below the chart by the caller, never drawn on it.
 */
export function CumulativeLineChart({ rows, notes, ariaLabel }: CumulativeLineChartProps) {
  const data = rows.map((r) => ({ ...r, label: shortYear(r.year) }));
  const lastIndex = data.length - 1;

  const renderDot = ({ cx, cy, index, payload }: DotProps) => {
    if (cx === undefined || cy === undefined || index === undefined || !payload) return <g key={index} />;
    const noteNumber = notes.findIndex((n) => n.year === payload.year) + 1;
    return (
      <g key={index}>
        {index === lastIndex && (
          <>
            <circle cx={cx} cy={cy} r={4} fill="var(--module-primary)" />
            <text x={cx} y={cy - 12} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--text-primary)">
              {payload.total}
            </text>
          </>
        )}
        {noteNumber > 0 && (
          <>
            <circle cx={cx} cy={cy} r={10} fill="var(--module-primary)" stroke="var(--surface-page)" strokeWidth={2} />
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--text-inverse)">
              {noteNumber}
            </text>
          </>
        )}
      </g>
    );
  };

  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={data} margin={{ top: 24, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
          <YAxis allowDecimals={false} width={32} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => [value, 'Projects']} labelFormatter={(_, p) => p[0]?.payload.year} />
          <Line
            type="monotone"
            dataKey="total"
            stroke="var(--module-primary)"
            strokeWidth={2}
            dot={renderDot}
            activeDot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
