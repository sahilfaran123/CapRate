import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../services/api.js';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm">
      <p className="text-gray-500 mb-1">{label}</p>
      <p className="font-bold text-indigo-600">{formatCurrency(val)}</p>
      {payload[0].payload.source === 'interpolated' && (
        <p className="text-xs text-gray-400 mt-1">Estimated (no data this day)</p>
      )}
    </div>
  );
};

export default function BalanceChart({ data, valueKey = 'balance', title, color = '#4F46E5' }) {
  if (!data || data.length === 0) {
    return (
      <div className="card flex items-center justify-center h-48">
        <p className="text-gray-400 text-sm">No historical data yet — check back after a day.</p>
      </div>
    );
  }

  // Reduce data points for display (max 90 labels)
  const step    = Math.max(1, Math.floor(data.length / 60));
  const display = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  const chartData = display.map(p => ({
    date:   new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value:  p[valueKey],
    source: p.source,
  }));

  const values      = chartData.map(d => d.value).filter(v => !isNaN(v));
  const current     = values[values.length - 1] || 0;
  const start       = values[0] || 0;
  const change      = current - start;
  const changePct   = start > 0 ? ((change / start) * 100).toFixed(2) : 0;
  const isPositive  = change >= 0;

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(current)}</p>
        </div>
        <div className={`text-right ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
          <p className="text-sm font-semibold">
            {isPositive ? '+' : ''}{formatCurrency(change)}
          </p>
          <p className="text-xs">
            {isPositive ? '+' : ''}{changePct}%
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#9CA3AF' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#9CA3AF' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => formatCurrency(v, true)}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
