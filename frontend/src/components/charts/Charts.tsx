import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type TooltipProps,
} from 'recharts';

/**
 * Validated categorical order (dataviz reference palette): fixed slot order,
 * never cycled; colour follows the series, not its rank.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
/** Reserved status colours (always shown with a text label). */
export const STATUS_COLORS: Record<string, string> = {
  APPROVED: '#16a34a', PENDING: '#d97706', REJECTED: '#dc2626', CANCELLED: '#94a3b8',
  VERIFIED: '#16a34a', OVERDUE: '#dc2626',
};

const AXIS = { fontSize: 12, fill: '#64748b' };
const GRID = '#eef1f6';

export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
}

type Fmt = (v: number) => string;

function ChartTooltip({ active, payload, label, fmt, labelFmt }: TooltipProps<number, string> & { fmt?: Fmt; labelFmt?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-pop backdrop-blur">
      <p className="mb-1.5 font-semibold text-navy-900">{labelFmt ? labelFmt(String(label)) : label}</p>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="size-2 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold text-slate-900 tabular">{fmt ? fmt(Number(p.value)) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

function LegendRow({ series }: { series: SeriesDef[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {series.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: s.color ?? SERIES[i] }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

export function BarChartCard({
  data, x, series, height = 260, horizontal, stacked, fmt, axisFmt, labelFmt,
}: {
  data: Record<string, unknown>[]; x: string; series: SeriesDef[]; height?: number; horizontal?: boolean;
  stacked?: boolean; fmt?: Fmt; axisFmt?: Fmt; labelFmt?: (l: string) => string;
}) {
  const colored = series.map((s, i) => ({ ...s, color: s.color ?? SERIES[i] }));
  const radius: [number, number, number, number] = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
  return (
    <div>
      <LegendRow series={colored} />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 4, right: 12, bottom: 0, left: horizontal ? 8 : -8 }} barCategoryGap={horizontal ? 6 : '22%'}>
          <CartesianGrid stroke={GRID} vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={axisFmt} />
              <YAxis type="category" dataKey={x} tick={AXIS} axisLine={false} tickLine={false} width={130} />
            </>
          ) : (
            <>
              <XAxis dataKey={x} tick={AXIS} axisLine={false} tickLine={false} tickFormatter={labelFmt} interval="preserveStartEnd" minTickGap={8} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={axisFmt} width={56} />
            </>
          )}
          <Tooltip cursor={{ fill: 'rgba(42,120,214,0.06)' }} content={<ChartTooltip fmt={fmt} labelFmt={labelFmt} />} />
          {colored.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stacked ? 'a' : undefined}
              radius={stacked ? (i === colored.length - 1 ? radius : [0, 0, 0, 0]) : radius}
              maxBarSize={horizontal ? 22 : 36} stroke="#fff" strokeWidth={stacked ? 1 : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineChartCard({
  data, x, series, height = 260, fmt, axisFmt, labelFmt,
}: { data: Record<string, unknown>[]; x: string; series: SeriesDef[]; height?: number; fmt?: Fmt; axisFmt?: Fmt; labelFmt?: (l: string) => string }) {
  const colored = series.map((s, i) => ({ ...s, color: s.color ?? SERIES[i] }));
  return (
    <div>
      <LegendRow series={colored} />
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={x} tick={AXIS} axisLine={false} tickLine={false} tickFormatter={labelFmt} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={axisFmt} width={56} />
          <Tooltip cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} content={<ChartTooltip fmt={fmt} labelFmt={labelFmt} />} />
          {colored.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export { Legend };
