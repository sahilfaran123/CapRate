import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { addProperty, updatePropertyInputs, formatCurrency } from '../services/api.js';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

/**
 * Deal Analyzer (PRD Feature 2)
 * Standalone calculator to evaluate a potential property purchase.
 * All calculations client-side, real-time as user types.
 */

const DEFAULTS = {
  address:        '',
  purchasePrice:  '',
  downPayment:    '',
  interestRate:   '',
  loanTermYears:  30,
  monthlyRent:    '',
  propertyTax:    '',
  insurance:      '',
  hoa:            '',
  maintenance:    '',
  vacancyRate:    5,
  managementRate: 0,
  appreciationRate: 3,
};

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

// Defined OUTSIDE the page component so inputs keep focus across re-renders
const Field = ({ label, value, onChange, prefix, suffix, placeholder, hint }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <div className="relative">
      {prefix && <span className="absolute left-3 top-2.5 text-gray-400 text-sm">{prefix}</span>}
      <input
        type="number" min="0" step="any"
        value={value} onChange={onChange} placeholder={placeholder}
        className={`w-full py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-8' : 'pr-3'}`}
      />
      {suffix && <span className="absolute right-3 top-2.5 text-gray-400 text-sm">{suffix}</span>}
    </div>
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);

export default function DealAnalyzer() {
  const navigate = useNavigate();
  const [form, setForm]       = useState(DEFAULTS);
  const [adding, setAdding]   = useState(false);
  const [addForm, setAddForm] = useState({ address: '', city: '', state: '', zipCode: '' });
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const set = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));

  // Auto-default maintenance to 1% of value / 12 when purchase price entered and maintenance untouched
  const maintenanceDefault = form.purchasePrice ? Math.round(num(form.purchasePrice) * 0.01 / 12) : 0;

  const r = useMemo(() => {
    const price = num(form.purchasePrice);
    const down  = num(form.downPayment);
    const rate  = num(form.interestRate);
    const rent  = num(form.monthlyRent);
    if (!price || !down || !rate || !rent) return null;

    const term        = parseInt(form.loanTermYears) || 30;
    const loanAmount  = price - down;
    if (loanAmount <= 0) return null;

    const mr  = rate / 100 / 12;
    const n   = term * 12;
    const pi  = loanAmount * (mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1);

    const vacancyLoss   = rent * (num(form.vacancyRate) / 100);
    const effectiveRent = rent - vacancyLoss;
    const management    = effectiveRent * (num(form.managementRate) / 100);
    const maintenance   = form.maintenance !== '' ? num(form.maintenance) : maintenanceDefault;
    const tax           = num(form.propertyTax);
    const insurance     = num(form.insurance);
    const hoa           = num(form.hoa);

    const totalExpenses   = pi + tax + insurance + hoa + maintenance + management;
    const monthlyCashFlow = effectiveRent - totalExpenses;
    const annualCashFlow  = monthlyCashFlow * 12;
    const cocReturn       = (annualCashFlow / down) * 100;

    const noiMonthly = effectiveRent - (tax + insurance + hoa + maintenance + management);
    const capRate    = (noiMonthly * 12 / price) * 100;
    const grm        = price / (rent * 12);
    const totalInterest = Math.round(pi * n - loanAmount);

    // 5-year projection
    const appRate = num(form.appreciationRate) / 100;
    const projection = [];
    let value = price;
    let balance = loanAmount;
    for (let year = 1; year <= 5; year++) {
      value *= 1 + appRate;
      for (let m = 0; m < 12; m++) {
        const interest = balance * mr;
        balance -= (pi - interest);
      }
      projection.push({
        year,
        value:    Math.round(value),
        equity:   Math.round(value - Math.max(0, balance)),
        cashFlow: Math.round(annualCashFlow),
      });
    }
    const totalReturn = Math.round(
      (projection[4].equity - down) + annualCashFlow * 5
    );

    return {
      loanAmount, pi: Math.round(pi), vacancyLoss: Math.round(vacancyLoss),
      effectiveRent: Math.round(effectiveRent), management: Math.round(management),
      maintenance: Math.round(maintenance), tax, insurance, hoa,
      totalExpenses: Math.round(totalExpenses),
      monthlyCashFlow: Math.round(monthlyCashFlow),
      annualCashFlow: Math.round(annualCashFlow),
      cocReturn, capRate, grm, totalInterest, projection, totalReturn,
    };
  }, [form, maintenanceDefault]);

  const cocColor = r ? (r.cocReturn >= 8 ? 'text-emerald-600' : r.cocReturn >= 5 ? 'text-amber-500' : 'text-red-500') : '';
  const cfColor  = r ? (r.monthlyCashFlow >= 0 ? 'text-emerald-600' : 'text-red-500') : '';

  const handleAddToPortfolio = async (e) => {
    e.preventDefault();
    if (!addForm.address || !addForm.city || !addForm.state) {
      setAddError('Address, city, and state are required.');
      return;
    }
    setAddLoading(true);
    setAddError('');
    try {
      const res = await addProperty({ ...addForm });
      // Pre-fill the property inputs from the analyzer
      const propId = res.property?.propertyId || res.property?._id;
      if (propId) {
        await updatePropertyInputs(propId, {
          purchasePrice:      num(form.purchasePrice),
          downPayment:        num(form.downPayment),
          interestRate:       num(form.interestRate),
          loanTermYears:      parseInt(form.loanTermYears) || 30,
          actualMonthlyRent:  num(form.monthlyRent),
          monthlyMortgage:    r?.pi || 0,
          monthlyPropertyTax: num(form.propertyTax),
          monthlyInsurance:   num(form.insurance),
          monthlyHOA:         num(form.hoa),
          monthlyMaintenance: form.maintenance !== '' ? num(form.maintenance) : maintenanceDefault,
        });
      }
      navigate('/real-estate');
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add property. Check the address.');
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <ErrorBoundary section="Deal Analyzer">
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Deal Analyzer</h1>
        <p className="text-gray-500 text-sm mt-1">Run the numbers on a potential property purchase</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Inputs (left panel) ── */}
        <div className="lg:col-span-2 card space-y-4 self-start">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Deal Inputs</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property Address <span className="text-gray-300">(optional)</span></label>
            <input
              type="text" value={form.address} onChange={set('address')}
              placeholder="123 Main St, Anytown"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase Price" value={form.purchasePrice} onChange={set('purchasePrice')} prefix="$" placeholder="400,000" />
            <Field label="Down Payment"   value={form.downPayment}   onChange={set('downPayment')}   prefix="$" placeholder="80,000" />
            <Field label="Interest Rate"  value={form.interestRate}  onChange={set('interestRate')}  suffix="%" placeholder="6.50" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loan Term</label>
              <select
                value={form.loanTermYears} onChange={set('loanTermYears')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value={30}>30 years</option>
                <option value={20}>20 years</option>
                <option value={15}>15 years</option>
                <option value={10}>10 years</option>
              </select>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-3">
            <Field label="Expected Monthly Rent" value={form.monthlyRent} onChange={set('monthlyRent')} prefix="$" placeholder="2,500" />
            <Field label="Monthly Property Tax"  value={form.propertyTax} onChange={set('propertyTax')} prefix="$" placeholder="300" />
            <Field label="Monthly Insurance"     value={form.insurance}   onChange={set('insurance')}   prefix="$" placeholder="150" />
            <Field label="Monthly HOA"           value={form.hoa}         onChange={set('hoa')}         prefix="$" placeholder="0" />
            <Field
              label="Monthly Maintenance" value={form.maintenance} onChange={set('maintenance')} prefix="$"
              placeholder={maintenanceDefault ? String(maintenanceDefault) : '0'}
              hint={maintenanceDefault ? `Default: ${formatCurrency(maintenanceDefault)} (1% of value/yr)` : undefined}
            />
            <Field label="Vacancy Rate" value={form.vacancyRate} onChange={set('vacancyRate')} suffix="%" hint="Default 5%" />
            <Field label="Property Management" value={form.managementRate} onChange={set('managementRate')} suffix="%" hint="% of rent, default 0%" />
            <Field label="Appreciation" value={form.appreciationRate} onChange={set('appreciationRate')} suffix="%" hint="Annual, default 3%" />
          </div>
        </div>

        {/* ── Outputs (right panel) ── */}
        <div className="lg:col-span-3 space-y-4">
          {!r ? (
            <div className="card text-center py-16 text-gray-400">
              <p className="text-lg mb-1">Enter the deal basics</p>
              <p className="text-sm">Purchase price, down payment, interest rate, and expected rent are required.</p>
            </div>
          ) : (
            <>
              {/* Primary metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="card">
                  <p className="text-xs text-gray-400 mb-1">Monthly Cash Flow</p>
                  <p className={`text-xl font-bold ${cfColor}`}>{r.monthlyCashFlow >= 0 ? '+' : ''}{formatCurrency(r.monthlyCashFlow)}</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray-400 mb-1">Cash-on-Cash Return</p>
                  <p className={`text-xl font-bold ${cocColor}`}>{r.cocReturn.toFixed(1)}%</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray-400 mb-1">Cap Rate</p>
                  <p className="text-xl font-bold text-gray-900">{r.capRate.toFixed(1)}%</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray-400 mb-1">Gross Rent Multiplier</p>
                  <p className="text-xl font-bold text-gray-900">{r.grm.toFixed(1)}x</p>
                </div>
              </div>

              {/* Breakdown */}
              <div className="card grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Income</p>
                  <p className="flex justify-between"><span className="text-gray-500">Gross Monthly Rent</span><span className="font-medium">{formatCurrency(num(form.monthlyRent))}</span></p>
                  <p className="flex justify-between"><span className="text-gray-500">Vacancy ({form.vacancyRate}%)</span><span className="font-medium text-red-500">-{formatCurrency(r.vacancyLoss)}</span></p>
                  <p className="flex justify-between border-t border-gray-100 pt-1.5"><span className="text-gray-600 font-medium">Effective Rent</span><span className="font-semibold">{formatCurrency(r.effectiveRent)}</span></p>

                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium pt-3">Mortgage</p>
                  <p className="flex justify-between"><span className="text-gray-500">Loan Amount</span><span className="font-medium">{formatCurrency(r.loanAmount)}</span></p>
                  <p className="flex justify-between"><span className="text-gray-500">Monthly P&I</span><span className="font-medium">{formatCurrency(r.pi)}</span></p>
                  <p className="flex justify-between"><span className="text-gray-500">Total Interest ({form.loanTermYears}yr)</span><span className="font-medium">{formatCurrency(r.totalInterest)}</span></p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Expenses</p>
                  <p className="flex justify-between"><span className="text-gray-500">Mortgage P&I</span><span className="font-medium">{formatCurrency(r.pi)}</span></p>
                  {r.tax > 0        && <p className="flex justify-between"><span className="text-gray-500">Property Tax</span><span className="font-medium">{formatCurrency(r.tax)}</span></p>}
                  {r.insurance > 0  && <p className="flex justify-between"><span className="text-gray-500">Insurance</span><span className="font-medium">{formatCurrency(r.insurance)}</span></p>}
                  {r.hoa > 0        && <p className="flex justify-between"><span className="text-gray-500">HOA</span><span className="font-medium">{formatCurrency(r.hoa)}</span></p>}
                  {r.maintenance > 0 && <p className="flex justify-between"><span className="text-gray-500">Maintenance</span><span className="font-medium">{formatCurrency(r.maintenance)}</span></p>}
                  {r.management > 0 && <p className="flex justify-between"><span className="text-gray-500">Management</span><span className="font-medium">{formatCurrency(r.management)}</span></p>}
                  <p className="flex justify-between border-t border-gray-100 pt-1.5"><span className="text-gray-600 font-medium">Total Expenses</span><span className="font-semibold">{formatCurrency(r.totalExpenses)}</span></p>

                  <p className="flex justify-between border-t border-gray-200 pt-2 mt-2">
                    <span className="font-semibold text-gray-800">Monthly Cash Flow</span>
                    <span className={`font-bold ${cfColor}`}>{r.monthlyCashFlow >= 0 ? '+' : ''}{formatCurrency(r.monthlyCashFlow)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-gray-500">Annual Cash Flow</span>
                    <span className={`font-semibold ${cfColor}`}>{r.annualCashFlow >= 0 ? '+' : ''}{formatCurrency(r.annualCashFlow)}</span>
                  </p>
                </div>
              </div>

              {/* 5-year projection */}
              <div className="card">
                <h3 className="text-sm font-bold text-gray-900 mb-3">5-Year Projection <span className="font-normal text-gray-400">({form.appreciationRate}% appreciation)</span></h3>
                <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[440px]">
                  <thead>
                    <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                      <th className="pb-2 font-medium">Year</th>
                      <th className="pb-2 font-medium text-right">Property Value</th>
                      <th className="pb-2 font-medium text-right">Equity</th>
                      <th className="pb-2 font-medium text-right">Annual Cash Flow</th>
                      <th className="pb-2 font-medium text-right">Total Return</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {r.projection.map((row, i) => (
                      <tr key={row.year}>
                        <td className="py-2 font-medium">{row.year}</td>
                        <td className="py-2 text-right">{formatCurrency(row.value)}</td>
                        <td className="py-2 text-right text-indigo-600 font-medium">{formatCurrency(row.equity)}</td>
                        <td className={`py-2 text-right ${cfColor}`}>{row.cashFlow >= 0 ? '+' : ''}{formatCurrency(row.cashFlow)}</td>
                        <td className="py-2 text-right font-semibold">{i === 4 ? formatCurrency(r.totalReturn) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>

              {/* Add to portfolio */}
              <div className="card">
                {!adding ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">Buying this property?</p>
                      <p className="text-xs text-gray-400 mt-0.5">Add it to your portfolio with these numbers pre-filled.</p>
                    </div>
                    <button onClick={() => setAdding(true)} className="btn-primary text-sm">Add to Portfolio</button>
                  </div>
                ) : (
                  <form onSubmit={handleAddToPortfolio} className="space-y-3">
                    <p className="font-semibold text-gray-900 text-sm">Confirm the property address</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <input
                          type="text" placeholder="Street address"
                          value={addForm.address}
                          onChange={e => setAddForm(p => ({ ...p, address: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <input
                        type="text" placeholder="City"
                        value={addForm.city}
                        onChange={e => setAddForm(p => ({ ...p, city: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text" placeholder="State"
                          value={addForm.state}
                          onChange={e => setAddForm(p => ({ ...p, state: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <input
                          type="text" placeholder="ZIP"
                          value={addForm.zipCode}
                          onChange={e => setAddForm(p => ({ ...p, zipCode: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    {addError && <p className="text-red-500 text-sm">{addError}</p>}
                    <div className="flex gap-2">
                      <button type="submit" disabled={addLoading} className="btn-primary text-sm disabled:opacity-50">
                        {addLoading ? 'Adding…' : 'Add property'}
                      </button>
                      <button type="button" onClick={() => setAdding(false)} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
