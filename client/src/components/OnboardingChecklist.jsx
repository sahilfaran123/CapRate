import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext.jsx';

/**
 * First-run checklist shown at the top of the Dashboard.
 *
 * Non-blocking by design: it sits above the normal content, ticks steps off as
 * the user completes them for real, and disappears once dismissed. Step state is
 * DERIVED from live account data (a connected bank, a saved property) rather
 * than stored, so removing your last property correctly re-opens that step.
 */

function StepRow({ step, index, onAction }) {
  const { done, title, body, cta } = step;

  return (
    <li className={`flex items-start gap-3 py-3 ${done ? 'opacity-60' : ''}`}>
      {/* Status bubble */}
      <span
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5
          ${done
            ? 'bg-emerald-500 text-white'
            : 'bg-white border-2 border-indigo-200 text-indigo-500'}`}
        aria-hidden="true"
      >
        {done ? '✓' : index + 1}
      </span>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
          {title}
        </p>
        {!done && body && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{body}</p>}
      </div>

      {!done && cta && (
        <button
          onClick={() => onAction(step)}
          className="btn-primary text-xs whitespace-nowrap shrink-0"
        >
          {cta}
        </button>
      )}
    </li>
  );
}

export default function OnboardingChecklist({ properties, bankAccounts, onAddProperty, onConnectBank }) {
  const navigate = useNavigate();
  const { onboarding, updateOnboarding } = useUser();

  // Wait for /api/auth/me
  if (!onboarding) return null;

  const { investorType, exploredDealAnalyzer, dismissed } = onboarding;

  const hasProperty = (properties?.length ?? 0) > 0;
  const hasBank     = (bankAccounts?.length ?? 0) > 0;

  if (dismissed) return null;

  // Existing users predate this flow. If they already have real data and never
  // picked a path, they are plainly not first-run — don't nag them.
  if (!investorType && (hasProperty || hasBank)) return null;

  // ── Step 1: which kind of investor are we talking to? ──
  if (!investorType) {
    return (
      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-6">
        <h2 className="text-lg font-bold text-gray-900">Welcome to CapRate</h2>
        <p className="text-sm text-gray-600 mt-1 mb-5 max-w-2xl">
          Tell us where you are and we'll set up the right starting point. Every feature stays available either way.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => updateOnboarding({ investorType: 'owner' })}
            className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-400 hover:shadow-sm transition-all group"
          >
            <p className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
              I own rental property
            </p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Track value, equity, and real cash flow across your portfolio.
            </p>
          </button>

          <button
            onClick={() => updateOnboarding({ investorType: 'shopper' })}
            className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-400 hover:shadow-sm transition-all group"
          >
            <p className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
              I'm shopping for my first
            </p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Underwrite deals before you buy and see what the numbers do.
            </p>
          </button>
        </div>

        <button
          onClick={() => updateOnboarding({ dismissed: true })}
          className="text-xs text-gray-400 hover:text-gray-600 mt-4 transition-colors"
        >
          Skip for now
        </button>
      </section>
    );
  }

  // ── Steps 2+: branch on investor type ──
  const ownerSteps = [
    {
      key:   'property',
      done:  hasProperty,
      title: 'Add your first property',
      body:  'We pull the estimated value and market rent automatically from the address.',
      cta:   'Add property',
      action: onAddProperty,
    },
    {
      key:   'bank',
      done:  hasBank,
      title: 'Connect your bank',
      body:  'Turns estimated cash flow into bank-verified actuals, and adds cash to your net worth.',
      cta:   'Connect bank',
      action: onConnectBank,
    },
  ];

  const shopperSteps = [
    {
      key:   'analyze',
      done:  exploredDealAnalyzer,
      title: 'Analyze a deal',
      body:  'Enter a price, rent, and loan terms to see cash flow, cap rate, and 5-year return.',
      cta:   'Open Deal Analyzer',
      action: () => {
        updateOnboarding({ exploredDealAnalyzer: true });
        navigate('/deal-analyzer');
      },
    },
    {
      key:   'bank',
      done:  hasBank,
      title: 'Connect your bank',
      body:  'See what you have available for a down payment alongside the deals you are running.',
      cta:   'Connect bank',
      action: onConnectBank,
    },
    {
      key:   'property',
      done:  hasProperty,
      title: 'Add a property when you buy',
      body:  'Once you close, add the address to start tracking equity and real cash flow.',
      cta:   'Add property',
      action: onAddProperty,
    },
  ];

  const steps     = investorType === 'shopper' ? shopperSteps : ownerSteps;
  const doneCount = steps.filter(s => s.done).length;
  const allDone   = doneCount === steps.length;

  return (
    <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h2 className="text-lg font-bold text-gray-900">
          {allDone ? "You're all set" : 'Get started'}
        </h2>
        <button
          onClick={() => updateOnboarding({ dismissed: true })}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0"
        >
          {allDone ? 'Done' : 'Dismiss'}
        </button>
      </div>

      <p className="text-sm text-gray-600 mb-3">
        {allDone
          ? 'Your portfolio is connected. This card will not show again once dismissed.'
          : `${doneCount} of ${steps.length} complete — finish setup to see real numbers on your dashboard.`}
      </p>

      {/* Progress bar */}
      <div className="h-1.5 bg-indigo-100 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <ul className="divide-y divide-indigo-50">
        {steps.map((step, i) => (
          <StepRow
            key={step.key}
            step={step}
            index={i}
            onAction={(s) => s.action?.()}
          />
        ))}
      </ul>
    </section>
  );
}
