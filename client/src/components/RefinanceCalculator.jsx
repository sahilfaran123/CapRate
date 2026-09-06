import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { formatCurrency } from '../services/api.js';

/**
 * Refinance Calculator (PRD Feature 3)
 * Modal that compares the current loan against a new loan and shows break-even.
 */

function monthlyPayment(principal, annualRate, termYears) {
  const r = (annualRate / 100) / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export default function RefinanceCalculator({ property, onClose }) {
  const inputs = property.userInputs || {};
  const equity = property.equity || {};

  const remainingBalance = equity.remainingBalance || 0;
  const currentRate      = inputs.interestRate || 0;
  const currentPayment   = equity.calculatedMonthlyPayment
    || Math.round(monthlyPayment(inputs.purchasePrice - inputs.downPayment, currentRate, inputs.loanTermYears || 30));
  const monthsRemaining  = ((inputs.loanTermYears || 30) * 12) - (equity.monthsPaid || 0);

  const [form, setForm] = useState({
    newRate:      '',
    newTermYears: 30,
    closingCosts: 3000,
    cashOut:      0,
  });

  const handleChange = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const results = useMemo(() => {
    const newRate = parseFloat(form.newRate);
    if (!newRate || !remainingBalance) return null;

    const newTerm      = parseInt(form.newTermYears) || 30;
    const closingCosts = parseFloat(form.closingCosts) || 0;
    const cashOut      = parseFloat(form.cashOut) || 0;
    const newPrincipal = remainingBalance + cashOut;

    const newPayment = Math.round(monthlyPayment(newPrincipal, newRate, newTerm));
    const monthlySavings = currentPayment - newPayment;

    // Total interest comparisons
    const currentTotalInterest = Math.round(currentPayment * monthsRemaining - remainingBalance);
    const newTotalInterest     = Math.round(newPayment * newTerm * 12 - newPrincipal);

    // Break-even: months to recoup closing costs from savings
    const breakEvenMonths = monthlySavings > 0 ? Math.ceil(closingCosts / monthlySavings) : null;

    // Break-even chart data (cumulative savings over 60 months)
    const chartData = [];
    for (let m = 0; m <= 60; m += 3) {
      chartData.push({
        month:   m,
        savings: Math.round(monthlySavings * m - closingCosts),
      });
    }

    const fiveYearSavings = Math.round(monthlySavings * 60 - closingCosts);

    return {
      newPayment, monthlySavings, breakEvenMonths,
      currentTotalInterest, newTotalInterest,
      lifetimeInterestSaved: currentTotalInterest - newTotalInterest,
      fiveYearSavings, chartData, newTerm,
    };
  }, [form, remainingBalance, currentPayment, monthsRemaining]);

  const cashFlow = property.cashFlow?.monthly ?? null;

  // Recommendation banner
  let banner = null;
  if (results?.breakEvenMonths != null) {
    if (results.breakEvenMonths < 24) {
      banner = { color: 'emerald', text: `This refinance pays for itself in ${results.breakEvenMonths} months. Strong candidate.` };
    } else if (results.breakEvenMonths <= 48) {
      banner = { color: 'amber', text: `Moderate — ${results.breakEvenMonths} month break-even. Worth it if you plan to hold the property long-term.` };
    } else {
      banner = { color: 'red', text: `High break-even period (${results.breakEvenMonths} months). Evaluate carefully.` };
    }
  } else if (results && results.monthlySavings <= 0) {
    banner = { color: 'red', text: 'The new payment is higher than your current payment. This refinance does not save money monthly.' };
  }

  const bannerClasses = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber:   'bg-amber-50 border-amber-200 text-amber-800',
    red:     'bg-red-50 border-red-200 text-red-800',
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-xl font-bold text-gray-900">Refinance Calculator</h2>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-lg">✕</button>
        </div>
        <p className="text-sm text-gray-400 mb-5 truncate">{property.address}</p>

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Interest Rate</label>
            <div className="relative">
              <input
                type="number" min="0" max="30" step="0.01"
                value={form.newRate}
                onChange={e => handleChange('newRate', e.target.value)}
                placeholder={currentRate ? `Current: ${currentRate}%` : '6.50'}
                className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="absolute right-3 top-2.5 text-gray-400 text-sm">%</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Loan Term</label>
            <select
              value={form.newTermYears}
              onChange={e => handleChange('newTermYears', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value={30}>30 years</option>
              <option value={20}>20 years</option>
              <option value={15}>15 years</option>
              <option value={10}>10 years</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Closing Costs</label>
            <input
              type="number" min="0"
              value={form.closingCosts}
              onChange={e => handleChange('closingCosts', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cash-Out Amount</label>
            <input
              type="number" min="0"
              value={form.cashOut}
              onChange={e => handleChange('cashOut', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1">For cash-out refi (optional)</p>
          </div>
        </div>

        {!results ? (
          <div className="bg-gray-50 rounded-xl p-6 text-center text-sm text-gray-400">
            Enter a new interest rate to see the comparison.
          </div>
        ) : (
          <div className="space-y-5">
            {/* Banner */}
            {banner && (
              <div className={`border rounded-xl px-4 py-3 text-sm font-medium ${bannerClasses[banner.color]}`}>
                {banner.text}
              </div>
            )}

            {/* Side by side */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">Current Loan</p>
                <div className="space-y-2 text-sm">
                  <p className="flex justify-between"><span className="text-gray-500">Rate</span><span className="font-semibold">{currentRate}%</span></p>
                  <p className="flex justify-between"><span className="text-gray-500">Payment</span><span className="font-semibold">{formatCurrency(currentPayment)}/mo</span></p>
                  <p className="flex justify-between"><span className="text-gray-500">Remaining</span><span className="font-semibold">{Math.round(monthsRemaining / 12)} yrs</span></p>
                  <p className="flex justify-between"><span className="text-gray-500">Total interest</span><span className="font-semibold">{formatCurrency(results.currentTotalInterest)}</span></p>
                </div>
              </div>
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                <p className="text-xs text-indigo-500 uppercase tracking-wide font-medium mb-3">New Loan</p>
                <div className="space-y-2 text-sm">
                  <p className="flex justify-between"><span className="text-gray-500">Rate</span><span className="font-semibold">{form.newRate}%</span></p>
                  <p className="flex justify-between"><span className="text-gray-500">Payment</span><span className="font-semibold">{formatCurrency(results.newPayment)}/mo</span></p>
                  <p className="flex justify-between"><span className="text-gray-500">Term</span><span className="font-semibold">{results.newTerm} yrs</span></p>
                  <p className="flex justify-between"><span className="text-gray-500">Total interest</span><span className="font-semibold">{formatCurrency(results.newTotalInterest)}</span></p>
                </div>
              </div>
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                <p className="text-xs text-gray-400 mb-0.5">Monthly Savings</p>
                <p className={`font-bold ${results.monthlySavings >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {results.monthlySavings >= 0 ? '+' : ''}{formatCurrency(results.monthlySavings)}
                </p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                <p className="text-xs text-gray-400 mb-0.5">Break-Even</p>
                <p className="font-bold text-gray-900">
                  {results.breakEvenMonths != null ? `${results.breakEvenMonths} mo` : '—'}
                </p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                <p className="text-xs text-gray-400 mb-0.5">5-Year Savings</p>
                <p className={`font-bold ${results.fiveYearSavings >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {formatCurrency(results.fiveYearSavings)}
                </p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                <p className="text-xs text-gray-400 mb-0.5">Lifetime Interest Saved</p>
                <p className={`font-bold ${results.lifetimeInterestSaved >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {formatCurrency(results.lifetimeInterestSaved)}
                </p>
              </div>
            </div>

            {/* Cash flow impact */}
            {cashFlow != null && (
              <div className="bg-gray-50 rounded-xl p-4 text-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Cash Flow Impact</p>
                <div className="flex items-center gap-6">
                  <p><span className="text-gray-500">Current: </span><span className="font-semibold">{cashFlow >= 0 ? '+' : ''}{formatCurrency(cashFlow)}/mo</span></p>
                  <span className="text-gray-300">→</span>
                  <p><span className="text-gray-500">After refi: </span>
                    <span className={`font-semibold ${(cashFlow + results.monthlySavings) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {(cashFlow + results.monthlySavings) >= 0 ? '+' : ''}{formatCurrency(cashFlow + results.monthlySavings)}/mo
                    </span>
                  </p>
                </div>
              </div>
            )}

            {/* Break-even chart */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Cumulative Savings Over Time</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={results.chartData}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} label={{ value: 'Months', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `$${Math.round(v / 1000)}k`} width={45} />
                  <Tooltip formatter={v => [formatCurrency(v), 'Cumulative savings']} labelFormatter={m => `Month ${m}`} contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }} />
                  <ReferenceLine y={0} stroke="#d1d5db" />
                  {results.breakEvenMonths != null && results.breakEvenMonths <= 60 && (
                    <ReferenceLine x={results.breakEvenMonths} stroke="#4f46e5" strokeDasharray="4 4" label={{ value: 'Break-even', fontSize: 11, fill: '#4f46e5', position: 'top' }} />
                  )}
                  <Line type="monotone" dataKey="savings" stroke="#4f46e5" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
