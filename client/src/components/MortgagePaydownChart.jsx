import {
  ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { formatCurrency } from '../services/api.js';

/**
 * Mortgage Paydown Visualization (PRD Feature 4)
 * Shows mortgage balance declining and equity growing over remaining loan term.
 */

function generateSchedule({ purchasePrice, downPayment, interestRate, loanTermYears = 30, monthsPaid = 0, currentValue, appreciationRate = 3 }) {
  const principal = purchasePrice - downPayment;
  if (!principal || principal <= 0 || !interestRate) return null;

  const r       = (interestRate / 100) / 12;
  const n       = loanTermYears * 12;
  const payment = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

  // Fast-forward to current position
  let balance = principal;
  for (let i = 0; i < Math.min(monthsPaid, n); i++) {
    const interest = balance * r;
    balance -= (payment - interest);
  }

  const yearsRemaining = Math.ceil((n - monthsPaid) / 12);
  const schedule = [];
  let value = currentValue || purchasePrice;

  for (let year = 0; year <= yearsRemaining; year++) {
    schedule.push({
      year:    `Yr ${year}`,
      yearNum: year,
      balance: Math.max(0, Math.round(balance)),
      equity:  Math.round(value - Math.max(0, balance)),
      value:   Math.round(value),
    });
    for (let m = 0; m < 12 && balance > 0; m++) {
      const interest = balance * r;
      balance -= (payment - interest);
    }
    value *= 1 + appreciationRate / 100;
  }

  // Total interest over full loan
  const totalInterest = Math.round(payment * n - principal);

  return { schedule, payment: Math.round(payment), totalInterest, yearsRemaining };
}

export default function MortgagePaydownChart({ property }) {
  const inputs = property.userInputs || {};
  const equity = property.equity;

  if (!inputs.purchasePrice || !inputs.downPayment || !inputs.interestRate) {
    return (
      <div className="bg-indigo-50 rounded-xl p-5 text-center">
        <p className="text-sm text-indigo-700 font-medium">Add mortgage details to see your paydown projection</p>
        <p className="text-xs text-indigo-500 mt-1">Purchase price, down payment, and interest rate are required.</p>
      </div>
    );
  }

  const result = generateSchedule({
    purchasePrice: inputs.purchasePrice,
    downPayment:   inputs.downPayment,
    interestRate:  inputs.interestRate,
    loanTermYears: inputs.loanTermYears || 30,
    monthsPaid:    equity?.monthsPaid || 0,
    currentValue:  property.estimatedValue,
  });

  if (!result) return null;

  const { schedule, totalInterest, yearsRemaining } = result;
  const payoffDate = new Date();
  payoffDate.setFullYear(payoffDate.getFullYear() + yearsRemaining);
  const atPayoff = schedule[schedule.length - 1];

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={schedule}>
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#9ca3af' }} interval="preserveStartEnd" />
          <YAxis
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickFormatter={v => `$${Math.round(v / 1000)}k`}
            width={50}
          />
          <Tooltip
            formatter={(val, name) => [formatCurrency(val), name === 'balance' ? 'Mortgage Balance' : 'Equity']}
            labelStyle={{ fontWeight: 600 }}
            contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }}
          />
          <Legend
            formatter={v => v === 'balance' ? 'Mortgage Balance' : 'Equity'}
            wrapperStyle={{ fontSize: 12 }}
          />
          <Area type="monotone" dataKey="balance" stroke="#f97316" fill="#fed7aa" fillOpacity={0.6} strokeWidth={2} />
          <Area type="monotone" dataKey="equity"  stroke="#4f46e5" fill="#c7d2fe" fillOpacity={0.6} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-0.5">Payoff Date</p>
          <p className="font-semibold text-gray-900">
            {payoffDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </p>
          <p className="text-xs text-gray-400">{yearsRemaining} years remaining</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-0.5">Current Balance</p>
          <p className="font-semibold text-gray-900">{formatCurrency(equity?.remainingBalance)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-0.5">Equity at Payoff (est.)</p>
          <p className="font-semibold text-indigo-600">{formatCurrency(atPayoff.equity)}</p>
          <p className="text-xs text-gray-400">3% annual appreciation</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-0.5">Total Interest (full loan)</p>
          <p className="font-semibold text-gray-900">{formatCurrency(totalInterest)}</p>
        </div>
      </div>
    </div>
  );
}
