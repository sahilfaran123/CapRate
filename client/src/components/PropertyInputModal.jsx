import { useState, useEffect } from 'react';
import { formatCurrency } from '../services/api.js';

const FIELDS = {
  income:   [{ key: 'actualMonthlyRent',   label: 'Actual Monthly Rent', placeholder: '2500', hint: 'What you collect each month' }],
  expenses: [
    { key: 'monthlyMortgage',   label: 'Mortgage (PITI)',      placeholder: '1800', hint: 'Principal + Interest + Tax + Insurance' },
    { key: 'monthlyHOA',        label: 'HOA Fees',             placeholder: '150' },
    { key: 'monthlyInsurance',  label: 'Property Insurance',   placeholder: '100', hint: 'If not included in mortgage' },
    { key: 'monthlyPropertyTax',label: 'Property Tax',         placeholder: '300', hint: 'If not included in mortgage' },
    { key: 'monthlyMaintenance',label: 'Maintenance & Repairs',placeholder: '100', hint: 'Monthly average estimate' },
  ],
};

function NumberInput({ field, value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
      <div className="relative">
        <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={e => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>
      {field.hint && <p className="text-xs text-gray-400 mt-1">{field.hint}</p>}
    </div>
  );
}

export default function PropertyInputModal({ property, isOpen, onClose, onSave }) {
  const [form, setForm]       = useState({});
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (property?.userInputs) {
      const inputs = property.userInputs;
      setForm({
        actualMonthlyRent:    inputs.actualMonthlyRent    ?? '',
        monthlyMortgage:      inputs.monthlyMortgage      ?? '',
        monthlyHOA:           inputs.monthlyHOA           ?? '',
        monthlyInsurance:     inputs.monthlyInsurance     ?? '',
        monthlyPropertyTax:   inputs.monthlyPropertyTax   ?? '',
        monthlyMaintenance:   inputs.monthlyMaintenance   ?? '',
        purchasePrice:        inputs.purchasePrice        ?? '',
        downPayment:          inputs.downPayment          ?? '',
        interestRate:         inputs.interestRate         ?? '',
        loanTermYears:        inputs.loanTermYears        ?? 30,
        purchaseDate:         inputs.purchaseDate
          ? new Date(inputs.purchaseDate).toISOString().split('T')[0]
          : '',
      });
    } else {
      setForm({ loanTermYears: 30 });
    }
  }, [property]);

  const handleChange = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const rent     = parseFloat(form.actualMonthlyRent)    || 0;
  const expenses = ['monthlyMortgage','monthlyHOA','monthlyInsurance','monthlyPropertyTax','monthlyMaintenance']
    .reduce((s, k) => s + (parseFloat(form[k]) || 0), 0);
  const cashFlow = rent - expenses;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between rounded-t-2xl">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Property Details</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate max-w-xs">{property?.address}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Income */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Monthly Income</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FIELDS.income.map(f => (
                <NumberInput key={f.key} field={f} value={form[f.key] ?? ''} onChange={handleChange} />
              ))}
            </div>
          </section>

          {/* Expenses */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Monthly Expenses</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FIELDS.expenses.map(f => (
                <NumberInput key={f.key} field={f} value={form[f.key] ?? ''} onChange={handleChange} />
              ))}
            </div>
          </section>

          {/* Purchase Details */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Purchase Details <span className="text-gray-400 font-normal normal-case">(optional)</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { key: 'purchasePrice', label: 'Purchase Price', placeholder: '350000' },
                { key: 'downPayment',   label: 'Down Payment',   placeholder: '70000' },
              ].map(f => (
                <NumberInput key={f.key} field={f} value={form[f.key] ?? ''} onChange={handleChange} />
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                <input
                  type="date"
                  value={form.purchaseDate ?? ''}
                  onChange={e => handleChange('purchaseDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </section>

          {/* Mortgage Details */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Mortgage Details <span className="text-gray-400 font-normal normal-case">(for equity tracking)</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interest Rate</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="30"
                    step="0.01"
                    value={form.interestRate ?? ''}
                    onChange={e => handleChange('interestRate', e.target.value)}
                    placeholder="6.75"
                    className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="absolute right-3 top-2.5 text-gray-400 text-sm">%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Annual interest rate</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loan Term</label>
                <select
                  value={form.loanTermYears ?? 30}
                  onChange={e => handleChange('loanTermYears', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value={30}>30 years</option>
                  <option value={20}>20 years</option>
                  <option value={15}>15 years</option>
                  <option value={10}>10 years</option>
                </select>
              </div>
            </div>
          </section>

          {/* Equity Preview */}
          {(() => {
            const purchase  = parseFloat(form.purchasePrice) || 0;
            const down      = parseFloat(form.downPayment)   || 0;
            const rate      = parseFloat(form.interestRate)  || 0;
            const term      = parseInt(form.loanTermYears)   || 30;
            const loanAmt   = purchase - down;

            if (!purchase || !down || !rate || loanAmt <= 0) return null;

            // Calculate months paid from purchase date
            let monthsPaid = 0;
            if (form.purchaseDate) {
              const start = new Date(form.purchaseDate);
              const now   = new Date();
              monthsPaid  = Math.max(0,
                (now.getFullYear() - start.getFullYear()) * 12 +
                (now.getMonth() - start.getMonth())
              );
            }

            // Amortization
            const r    = (rate / 100) / 12;
            const n    = term * 12;
            const powN = Math.pow(1 + r, n);
            const powK = Math.pow(1 + r, Math.min(monthsPaid, n));
            const remaining   = Math.max(0, loanAmt * (powN - powK) / (powN - 1));
            const principalPaid = loanAmt - remaining;
            const monthlyPmt  = loanAmt * (r * powN) / (powN - 1);

            return (
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                <h3 className="text-sm font-semibold text-emerald-800 mb-3">
                  Equity Preview
                  {monthsPaid > 0 && (
                    <span className="text-xs font-normal text-emerald-600 ml-2">
                      ({Math.floor(monthsPaid / 12)}y {monthsPaid % 12}m into loan)
                    </span>
                  )}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-emerald-600 mb-0.5">Loan Amount</p>
                    <p className="font-bold text-gray-900">{formatCurrency(loanAmt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 mb-0.5">Monthly Payment</p>
                    <p className="font-bold text-gray-900">{formatCurrency(monthlyPmt)}</p>
                    <p className="text-xs text-gray-400">Principal + Interest</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 mb-0.5">Principal Paid</p>
                    <p className="font-bold text-emerald-700">{formatCurrency(principalPaid)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 mb-0.5">Remaining Balance</p>
                    <p className="font-bold text-gray-900">{formatCurrency(remaining)}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Cash Flow Preview */}
          <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
            <h3 className="text-sm font-semibold text-indigo-800 mb-3">Cash Flow Preview</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-indigo-600 mb-1">Monthly Income</p>
                <p className="text-lg font-bold text-emerald-600">{formatCurrency(rent)}</p>
              </div>
              <div>
                <p className="text-xs text-indigo-600 mb-1">Monthly Expenses</p>
                <p className="text-lg font-bold text-red-500">{formatCurrency(expenses)}</p>
              </div>
              <div>
                <p className="text-xs text-indigo-600 mb-1">Net Cash Flow</p>
                <p className={`text-lg font-bold ${cashFlow >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {cashFlow >= 0 ? '+' : ''}{formatCurrency(cashFlow)}
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose}     className="btn-secondary">Cancel</button>
            <button onClick={handleSave}  className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Details'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
