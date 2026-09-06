import User from '../models/User.js';
import rentcastClient from '../services/rentcastClient.js';
import { plaidClient } from '../services/plaidClient.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// How long RentCast property data stays fresh before we re-fetch it.
// Property valuations move slowly, so a weekly refresh keeps data current while
// cutting RentCast API usage ~7x versus a daily refresh (3 calls per property
// per refresh: /properties, /avm/value, /avm/rent/long-term).
const PROPERTY_REFRESH_MS = 7 * ONE_DAY_MS;

// ─── Amortization Engine ─────────────────────────────────────────────────────
function remainingBalance(principal, annualRate, termYears, monthsPaid) {
  if (!principal || !annualRate || !termYears) return null;
  if (annualRate === 0) {
    const paid = (principal / (termYears * 12)) * monthsPaid;
    return Math.max(0, principal - paid);
  }
  const r    = (annualRate / 100) / 12;
  const n    = termYears * 12;
  const k    = Math.min(monthsPaid, n);
  const powN = Math.pow(1 + r, n);
  const powK = Math.pow(1 + r, k);
  return Math.max(0, principal * (powN - powK) / (powN - 1));
}

function calcEquity(inputs = {}, currentValue = null) {
  const { purchasePrice, downPayment, interestRate, loanTermYears = 30, purchaseDate } = inputs;
  if (!purchasePrice || !downPayment) return null;
  const loanAmount = purchasePrice - downPayment;
  if (loanAmount <= 0) return null;

  let monthsPaid = 0;
  if (purchaseDate) {
    const start = new Date(purchaseDate);
    const now   = new Date();
    monthsPaid  = Math.max(0,
      (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth()   - start.getMonth())
    );
  }

  const remaining = (interestRate && monthsPaid > 0)
    ? remainingBalance(loanAmount, interestRate, loanTermYears, monthsPaid)
    : loanAmount;

  const currentEquity            = currentValue != null ? currentValue - remaining : null;
  const principalPaid            = loanAmount - remaining;
  const equityFromAppreciation   = currentValue != null ? currentValue - purchasePrice : null;
  const totalEquityGrowth        = currentEquity != null ? currentEquity - downPayment : null;
  const ltv                      = currentValue ? ((remaining / currentValue) * 100).toFixed(1) : null;

  let calculatedMonthlyPayment = null;
  if (interestRate && loanTermYears) {
    const r = (interestRate / 100) / 12;
    const n = loanTermYears * 12;
    calculatedMonthlyPayment = r === 0
      ? loanAmount / n
      : loanAmount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  return {
    loanAmount:               Math.round(loanAmount),
    remainingBalance:         Math.round(remaining),
    currentEquity:            currentEquity != null ? Math.round(currentEquity) : null,
    principalPaid:            Math.round(principalPaid),
    equityFromPaydown:        Math.round(principalPaid),
    equityFromAppreciation:   equityFromAppreciation != null ? Math.round(equityFromAppreciation) : null,
    totalEquityGrowth:        totalEquityGrowth != null ? Math.round(totalEquityGrowth) : null,
    ltv,
    monthsPaid,
    loanTermYears,
    interestRate:             interestRate || null,
    calculatedMonthlyPayment: calculatedMonthlyPayment ? Math.round(calculatedMonthlyPayment) : null,
  };
}

function calcCashFlow(inputs = {}) {
  const rent     = inputs.actualMonthlyRent    || 0;
  const expenses = (inputs.monthlyMortgage     || 0)
                 + (inputs.monthlyHOA          || 0)
                 + (inputs.monthlyInsurance     || 0)
                 + (inputs.monthlyPropertyTax   || 0)
                 + (inputs.monthlyMaintenance   || 0);
  const monthly  = rent - expenses;
  const annual   = monthly * 12;
  const coc      = inputs.downPayment && inputs.downPayment > 0
    ? ((annual / inputs.downPayment) * 100).toFixed(2)
    : null;
  return { monthly, annual, cashOnCashReturn: coc, totalExpenses: expenses };
}

/**
 * Cap rate = (annual NOI / property value) × 100
 *
 * NOI deliberately EXCLUDES the mortgage. Cap rate measures how the property
 * itself performs, independent of how it was financed — two investors buying
 * the same building with different loans should compute the same cap rate.
 *
 * Preference order:
 *   1. The owner's real numbers (their rent minus their operating expenses).
 *      More meaningful than any estimate, since it reflects actual performance.
 *   2. RentCast's own capRate, when the user has not entered their figures.
 *   3. RentCast's market rent estimate, using a 40% expense ratio — the common
 *      industry rule of thumb when actual expenses are unknown.
 *
 * Returns { value, source } or null. No additional API calls are made: every
 * input is either user-entered or already present in the cached RentCast data.
 */
function calcCapRate(inputs = {}, data = {}, currentValue = null) {
  if (!currentValue || currentValue <= 0) return null;

  // 1. Owner's actual figures
  const actualRent = inputs.actualMonthlyRent || 0;
  if (actualRent > 0) {
    const operatingExpenses = (inputs.monthlyHOA        || 0)
                            + (inputs.monthlyInsurance   || 0)
                            + (inputs.monthlyPropertyTax || 0)
                            + (inputs.monthlyMaintenance || 0);
    const monthlyNOI = actualRent - operatingExpenses;
    if (monthlyNOI > 0) {
      return {
        value:  +(((monthlyNOI * 12) / currentValue) * 100).toFixed(2),
        source: 'actual',
      };
    }
  }

  // 2. RentCast already computed one
  if (data.capRate) {
    const parsed = parseFloat(data.capRate);
    if (!isNaN(parsed)) return { value: +parsed.toFixed(2), source: 'rentcast' };
  }

  // 3. Derive from RentCast's market rent estimate
  const marketRent = data.estimatedMonthlyRent || data.rentalValue || null;
  if (marketRent > 0) {
    const assumedNOI = marketRent * 0.6;          // 40% expense ratio
    return {
      value:  +(((assumedNOI * 12) / currentValue) * 100).toFixed(2),
      source: 'estimated',
    };
  }

  return null;
}

function buildPropertyResponse(property) {
  const data         = property.data || {};
  const inputs       = property.userInputs || {};
  const cashFlow     = calcCashFlow(inputs);
  const currentValue = property.estimatedValue || data.estimatedValue || null;

  let appreciation = null, appreciationPercent = null, appreciationLabel = null;
  if (inputs.purchasePrice && inputs.purchasePrice > 0 && currentValue) {
    appreciation        = currentValue - inputs.purchasePrice;
    appreciationPercent = ((appreciation / inputs.purchasePrice) * 100).toFixed(2);
    const yr            = inputs.purchaseDate
      ? new Date(inputs.purchaseDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : null;
    appreciationLabel   = yr ? `Since purchase (${yr})` : 'Since purchase';
  } else if (data.appreciation != null) {
    appreciation        = data.appreciation;
    appreciationPercent = data.appreciationPercent;
    appreciationLabel   = data.appreciationLabel;
  }

  const equity = calcEquity(inputs, currentValue);

  // ── Effective figures: prefer actual (bank-verified) over estimated ──
  const actuals    = property.actuals && property.actuals.computedAt ? property.actuals : null;
  const hasActual  = !!(actuals && actuals.monthlyCashFlow != null);
  const effectiveMonthlyCashFlow = hasActual ? actuals.monthlyCashFlow : (cashFlow?.monthly ?? null);
  const effectiveAnnualCashFlow  = effectiveMonthlyCashFlow != null ? effectiveMonthlyCashFlow * 12 : null;

  // Cash-on-cash uses the effective annual cash flow so it upgrades automatically
  const cocReturn = (effectiveAnnualCashFlow != null && inputs.downPayment > 0)
    ? +((effectiveAnnualCashFlow / inputs.downPayment) * 100).toFixed(1)
    : null;

  // Cap rate — prefers the owner's real numbers, falls back to RentCast data.
  // Must be applied AFTER the ...data spread below so it overrides RentCast's.
  const capRateResult = calcCapRate(inputs, data, currentValue);

  return {
    _id:            property._id,
    propertyId:     property.propertyId,
    provider:       property.provider,
    address:        property.address,
    estimatedValue: currentValue,
    lastRefreshed:  property.lastRefreshed,
    ...data,
    appreciation, appreciationPercent, appreciationLabel,
    userInputs: inputs,
    cashFlow,
    equity,
    // Cap rate — overrides any capRate that came through the ...data spread
    capRate:       capRateResult ? capRateResult.value  : null,
    capRateSource: capRateResult ? capRateResult.source : null,
    // Linked dedicated bank account
    linkedAccountId:   property.linkedAccountId   || null,
    linkedItemId:      property.linkedItemId      || null,
    linkedAccountName: property.linkedAccountName || null,
    // Actuals + effective figures
    actuals: actuals ? {
      monthlyCashFlow: actuals.monthlyCashFlow,
      annualCashFlow:  actuals.annualCashFlow,
      monthlyRent:     actuals.monthlyRent,
      monthsAnalyzed:  actuals.monthsAnalyzed,
      excludedCount:   actuals.excludedCount,
      currentBalance:  actuals.currentBalance,
      monthsOfReserve: actuals.monthsOfReserve,
      vacancyCount:    actuals.vacancyCount,
      computedAt:      actuals.computedAt,
    } : null,
    effective: {
      monthlyCashFlow: effectiveMonthlyCashFlow,
      annualCashFlow:  effectiveAnnualCashFlow,
      cocReturn,
      source: hasActual ? 'actual' : 'estimated',
    },
  };
}

// ─── GET /properties ──────────────────────────────────────────────────────────
export const getProperties = async (req, res, next) => {
  try {
    // req.userId is set by authenticate middleware (MongoDB _id)
    const user = await User.findById(req.userId);
    if (!user || user.realEstateProperties.length === 0) {
      return res.json({ properties: [], message: 'No properties added' });
    }

    const { forceRefresh } = req.query;
    const now     = new Date();
    const cutoff  = new Date(now.getTime() - PROPERTY_REFRESH_MS);
    let apiCalls  = 0;
    let cacheHits = 0;

    for (const property of user.realEstateProperties) {
      const needsRefresh =
        forceRefresh === 'true' ||
        !property.lastRefreshed  ||
        new Date(property.lastRefreshed) < cutoff;

      if (needsRefresh && property.provider === 'rentcast') {
        const addr = property.data?.addressComponents;
        if (addr) {
          try {
            const freshData = await rentcastClient.getPropertyDataByAddress(addr.address, addr.city, addr.state, addr.zipCode);
            property.data           = freshData;
            property.estimatedValue = freshData.estimatedValue;
            property.lastRefreshed  = now;
            apiCalls++;
          } catch (err) {
            console.error(`[Property Cache] ❌ RentCast failed for "${property.address}":`, err.message);
          }
        }
      } else if (!needsRefresh) {
        cacheHits++;
      }
    }

    if (apiCalls > 0) await user.save();

    // Refresh cached actuals for linked properties (throttled internally to 6h)
    let actualsRefreshed = 0;
    for (const property of user.realEstateProperties) {
      if (!property.linkedAccountId) continue;
      const before = property.actuals?.computedAt;
      await getCachedActuals(user, property, { force: forceRefresh === 'true' });
      if (property.actuals?.computedAt !== before) actualsRefreshed++;
    }
    if (actualsRefreshed > 0) await user.save();

    const properties = user.realEstateProperties.map(buildPropertyResponse);
    res.json({ properties, meta: { total: properties.length, apiCalls, cacheHits, actualsRefreshed } });
  } catch (err) {
    next(err);
  }
};

// ─── POST /add ────────────────────────────────────────────────────────────────
export const addProperty = async (req, res, next) => {
  try {
    const { address, city, state, zipCode } = req.body;
    if (!address || !city || !state) {
      return res.status(400).json({ error: 'address, city, state are required' });
    }

    const user = await User.findById(req.userId);

    if (!user) {
      // Check if token still contains email (old session)
      const byEmail = await User.findOne({ email: req.userId });
      if (byEmail) {
        return res.status(401).json({
          error: 'Session outdated. Please log out and log in again.',
          code:  'RELOGIN_REQUIRED',
        });
      }
      return res.status(404).json({ error: 'User not found' });
    }

    const data        = await rentcastClient.getPropertyDataByAddress(address, city, state, zipCode);
    const propertyId  = `rentcast-${address.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const fullAddress = `${address}, ${city}, ${state}${zipCode ? ` ${zipCode}` : ''}`;

    const duplicate = user.realEstateProperties.find(p =>
      p.address.toLowerCase().includes(address.toLowerCase())
    );
    if (duplicate) {
      return res.status(409).json({ error: 'Property already added', property: buildPropertyResponse(duplicate) });
    }

    user.realEstateProperties.push({
      provider:       'rentcast',
      propertyId,
      address:        fullAddress,
      estimatedValue: data.estimatedValue,
      lastRefreshed:  new Date(),
      data,
    });

    await user.save();
    const added = user.realEstateProperties[user.realEstateProperties.length - 1];
    res.status(201).json({ success: true, property: buildPropertyResponse(added) });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /property/:propertyId/inputs ─────────────────────────────────────────
export const updatePropertyInputs = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    const inputs         = req.body;

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const property = user.realEstateProperties.find(
      p => p.propertyId === propertyId || p._id?.toString() === propertyId
    );
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const existing     = property.userInputs || {};
    const numericFields = [
      'actualMonthlyRent','monthlyMortgage','monthlyHOA',
      'monthlyInsurance','monthlyPropertyTax','monthlyMaintenance',
      'purchasePrice','downPayment','interestRate','loanTermYears',
    ];
    numericFields.forEach(field => {
      if (inputs[field] !== undefined && inputs[field] !== '') {
        existing[field] = parseFloat(inputs[field]);
      }
    });
    if (inputs.purchaseDate !== undefined) existing.purchaseDate = inputs.purchaseDate || null;

    property.userInputs = existing;
    await user.save();

    const cashFlow = calcCashFlow(existing);
    const equity   = calcEquity(existing, property.estimatedValue);
    res.json({ success: true, userInputs: existing, cashFlow, equity });
  } catch (err) {
    next(err);
  }
};

// ─── POST /property/:propertyId/refresh ───────────────────────────────────────
export const refreshProperty = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    const user           = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const property = user.realEstateProperties.find(
      p => p.propertyId === propertyId || p._id?.toString() === propertyId
    );
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const addr = property.data?.addressComponents;
    if (!addr) return res.status(400).json({ error: 'No address components stored' });

    const freshData = await rentcastClient.getPropertyDataByAddress(addr.address, addr.city, addr.state, addr.zipCode);
    property.data           = freshData;
    property.estimatedValue = freshData.estimatedValue;
    property.lastRefreshed  = new Date();
    await user.save();

    res.json({ success: true, property: buildPropertyResponse(property) });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /property/:propertyId ─────────────────────────────────────────────
export const removeProperty = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    const user           = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const before = user.realEstateProperties.length;
    user.realEstateProperties = user.realEstateProperties.filter(
      p => p.propertyId !== propertyId && p._id?.toString() !== propertyId
    );
    if (user.realEstateProperties.length === before) {
      return res.status(404).json({ error: 'Property not found' });
    }
    await user.save();
    res.json({ success: true, message: 'Property removed' });
  } catch (err) {
    next(err);
  }
};

// ─── Property Events (PRD Feature 5) ─────────────────────────────────────────

/**
 * Mark a property's cached actuals stale so the next load recomputes them.
 * Called whenever an event changes, since logged vacancies affect which months
 * are included in the actual cash flow / rent averages.
 *
 * The timestamp is backdated rather than cleared: that forces a recompute, but
 * keeps the previous figures usable as a fallback if the refresh fails.
 */
function invalidateActuals(property) {
  if (property.actuals?.computedAt) {
    property.actuals.computedAt = new Date(0);
  }
}

function findProperty(user, propertyId) {
  return user.realEstateProperties.find(
    p => p.propertyId === propertyId || p._id?.toString() === propertyId
  );
}

// POST /property/:propertyId/event
export const addPropertyEvent = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    const { type, date, amount, description, category } = req.body;

    if (!type || !['vacancy', 'expense', 'income'].includes(type)) {
      return res.status(400).json({ error: 'type must be vacancy, expense, or income' });
    }
    if (!date || isNaN(new Date(date).getTime())) {
      return res.status(400).json({ error: 'A valid date is required' });
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const property = findProperty(user, propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });

    property.events.push({
      type,
      date:        new Date(date),
      amount:      amt,
      description: (description || '').slice(0, 200),
      category:    category || undefined,
    });
    invalidateActuals(property);   // vacancy events change which months are averaged
    await user.save();

    const added = property.events[property.events.length - 1];
    res.status(201).json({ success: true, event: added });
  } catch (err) {
    next(err);
  }
};

// DELETE /property/:propertyId/event/:eventId
export const deletePropertyEvent = async (req, res, next) => {
  try {
    const { propertyId, eventId } = req.params;

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const property = findProperty(user, propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const before = property.events.length;
    property.events = property.events.filter(e => e._id.toString() !== eventId);
    if (property.events.length === before) {
      return res.status(404).json({ error: 'Event not found' });
    }
    invalidateActuals(property);   // removing a vacancy re-includes that month
    await user.save();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// GET /property/:propertyId/events
export const getPropertyEvents = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const property = findProperty(user, propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const events = [...property.events].sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ events });
  } catch (err) {
    next(err);
  }
};

// ─── Tax Summary (PRD Feature 6) ─────────────────────────────────────────────
// GET /tax-summary?year=2025
export const getTaxSummary = async (req, res, next) => {
  try {
    const year = parseInt(req.query.year) || (new Date().getFullYear() - 1);

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const summary = [];

    for (const property of user.realEstateProperties) {
      const inputs = property.userInputs || {};
      const rent        = inputs.actualMonthlyRent  || 0;
      const mortgage    = inputs.monthlyMortgage    || 0;
      const tax         = inputs.monthlyPropertyTax || 0;
      const insurance   = inputs.monthlyInsurance   || 0;
      const hoa         = inputs.monthlyHOA         || 0;
      const maintenance = inputs.monthlyMaintenance || 0;

      // If a bank account is linked, pull real per-month figures for the year
      let actualByMonth = null;
      if (property.linkedAccountId) {
        try {
          const fin = await computePropertyFinancials(user, property, { year });
          if (!fin.error) {
            actualByMonth = {};
            for (const row of fin.months) {
              const [y, mm] = row.month.split('-');
              if (parseInt(y) === year) actualByMonth[parseInt(mm) - 1] = row;
            }
          }
        } catch (_) { /* fall back to estimates */ }
      }
      // Only INCOME is bank-derived; expenses always come from entered figures.
      const incomeSource = actualByMonth && Object.keys(actualByMonth).length ? 'actual' : 'estimated';

      // Events for the requested year, grouped by month
      const yearEvents = (property.events || []).filter(e => new Date(e.date).getFullYear() === year);

      const months = [];
      const totals = { income: 0, mortgage: 0, tax: 0, insurance: 0, hoa: 0, maintenance: 0, oneTime: 0, net: 0 };

      for (let m = 0; m < 12; m++) {
        const monthEvents = yearEvents.filter(e => new Date(e.date).getMonth() === m);
        const vacancyLoss = monthEvents.filter(e => e.type === 'vacancy').reduce((s, e) => s + e.amount, 0);
        const oneTimeExp  = monthEvents.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
        const oneTimeInc  = monthEvents.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);

        const act = actualByMonth ? actualByMonth[m] : null;

        // ── Hybrid approach ──
        // INCOME comes from real bank deposits when available. This is where real
        // data genuinely helps: it captures vacancies and partial payments that an
        // entered figure would miss.
        //
        // EXPENSES stay in their entered categories. Bank transactions show that
        // money left the account but not reliably WHICH category it belongs to,
        // and an accountant needs property tax, insurance, and maintenance
        // reported separately. Collapsing them into one "other" bucket would make
        // this export less useful than the categories the user already entered.
        //
        // The mortgage figure also stays entered rather than bank-derived: only
        // the interest portion is deductible, and that split comes from the
        // amortization schedule, not from the payment amount.
        const income = act
          ? act.rentIncome + act.otherIncome
          : Math.max(0, rent - vacancyLoss) + oneTimeInc;

        const mMortgage    = mortgage;
        const mTax         = tax;
        const mInsurance   = insurance;
        const mHoa         = hoa;
        const mMaintenance = maintenance;
        const mOneTime     = oneTimeExp;   // from the user's logged events

        const net = income - mMortgage - mTax - mInsurance - mHoa - mMaintenance - mOneTime;

        months.push({
          month:           `${MONTHS[m]} ${year}`,
          rentalIncome:    Math.round(income),
          mortgage:        Math.round(mMortgage),
          propertyTax:     Math.round(mTax),
          insurance:       Math.round(mInsurance),
          hoa:             Math.round(mHoa),
          maintenance:     Math.round(mMaintenance),
          oneTimeExpenses: Math.round(mOneTime),
          netCashFlow:     Math.round(net),
        });

        totals.income      += income;
        totals.mortgage    += mMortgage;
        totals.tax         += mTax;
        totals.insurance   += mInsurance;
        totals.hoa         += mHoa;
        totals.maintenance += mMaintenance;
        totals.oneTime     += mOneTime;
        totals.net         += net;
      }

      // Depreciation helper: (value * 0.8) / 27.5
      const value = property.estimatedValue || inputs.purchasePrice || 0;
      const depreciableBasis   = Math.round(value * 0.8);
      const annualDepreciation = Math.round(depreciableBasis / 27.5);

      summary.push({
        address: property.address,
        year,
        incomeSource,
        months,
        annualTotals: {
          rentalIncome:    Math.round(totals.income),
          mortgage:        Math.round(totals.mortgage),
          propertyTax:     Math.round(totals.tax),
          insurance:       Math.round(totals.insurance),
          hoa:             Math.round(totals.hoa),
          maintenance:     Math.round(totals.maintenance),
          oneTimeExpenses: Math.round(totals.oneTime),
          netCashFlow:     Math.round(totals.net),
        },
        depreciation: {
          propertyValue:      Math.round(value),
          landValueEstimate:  Math.round(value * 0.2),
          depreciableBasis,
          annualDepreciation,
        },
      });
    }

    res.json({ year, properties: summary });
  } catch (err) {
    next(err);
  }
};

// ─── Property ↔ Bank Account Linking ─────────────────────────────────────────

// PUT /property/:propertyId/link-account
export const linkPropertyAccount = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    const { accountId, itemId, accountName } = req.body;

    if (!accountId || !itemId) {
      return res.status(400).json({ error: 'accountId and itemId are required' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // The item must belong to this user
    const item = user.plaidItems.find(i => i.itemId === itemId);
    if (!item) return res.status(400).json({ error: 'Bank connection not found' });

    const property = findProperty(user, propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });

    property.linkedAccountId   = accountId;
    property.linkedItemId      = itemId;
    property.linkedAccountName = (accountName || '').slice(0, 100) || null;
    await user.save();

    res.json({ success: true, linkedAccountId: accountId, linkedAccountName: property.linkedAccountName });
  } catch (err) {
    next(err);
  }
};

// DELETE /property/:propertyId/link-account
export const unlinkPropertyAccount = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const property = findProperty(user, propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });

    property.linkedAccountId   = null;
    property.linkedItemId      = null;
    property.linkedAccountName = null;
    await user.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── Property Financials Engine ──────────────────────────────────────────────
// Computes actual income/expenses from a linked bank account's real transactions.
// Used by both the /financials endpoint and getProperties (cached).

const ACTUALS_TTL_MS = 6 * 60 * 60 * 1000;   // re-derive at most every 6 hours

/**
 * Analyze a linked account's transactions for a property.
 * Returns the full financials payload, or null if not linked / unavailable.
 * Throws only on unexpected errors; expected Plaid failures return { error }.
 */
/**
 * @param {object} opts
 *   monthsBack — how far back to pull transactions (default 6). The Banking tab
 *                only ever displays and averages recent months, so fetching 12
 *                made every load roughly twice as slow for no benefit.
 *   year       — when set, fetches that full calendar year instead. The tax
 *                export needs this: asking for 2025 in mid-2026 is outside a
 *                rolling 12-month window, so a relative lookback would silently
 *                return only part of the year.
 */
async function computePropertyFinancials(user, property, opts = {}) {
  const { monthsBack = 6, year = null } = opts;

  if (!property.linkedAccountId || !property.linkedItemId) {
    return { error: 'NOT_LINKED' };
  }
  const item = user.plaidItems.find(i => i.itemId === property.linkedItemId);
  if (!item) return { error: 'ITEM_GONE' };

  let start, end;
  if (year) {
    start = new Date(Date.UTC(year, 0, 1));
    end   = new Date(Date.UTC(year, 11, 31));
    const today = new Date();
    if (end > today) end = today;            // never request future dates
  } else {
    end   = new Date();
    start = new Date();
    start.setMonth(start.getMonth() - monthsBack);
  }
  const fmt = d => d.toISOString().split('T')[0];

  let transactions = [];
  let currentBalance = null;
  try {
    const [txRes, balRes] = await Promise.all([
      plaidClient.transactionsGet({
        access_token: item.accessToken,
        start_date:   fmt(start),
        end_date:     fmt(end),
        options:      { count: 500, offset: 0, account_ids: [property.linkedAccountId] },
      }),
      plaidClient.accountsBalanceGet({
        access_token: item.accessToken,
        options:      { account_ids: [property.linkedAccountId] },
      }),
    ]);
    transactions   = txRes.data.transactions;
    currentBalance = balRes.data.accounts?.[0]?.balances?.current ?? null;
  } catch (err) {
    const code = err.response?.data?.error_code;
    if (code === 'ITEM_LOGIN_REQUIRED' || code === 'INVALID_ACCESS_TOKEN') {
      return { error: 'RECONNECT' };
    }
    throw err;
  }

  // ── Detection heuristics ──
  // Plaid sign convention: positive amount = money OUT, negative = money IN
  const inputs       = property.userInputs || {};
  const expectedRent = inputs.actualMonthlyRent || null;

  // Expected mortgage: prefer what the user entered, otherwise fall back to the
  // payment our amortization engine calculated from price/down/rate/term.
  const calcPayment      = calcEquity(inputs, property.estimatedValue)?.calculatedMonthlyPayment || null;
  const expectedMortgage = inputs.monthlyMortgage || calcPayment || null;

  /**
   * Find recurring debit "series": the same merchant (or near-identical amount)
   * charging on a monthly cadence. A mortgage is the strongest such pattern, but
   * this also catches insurance, HOA, and property-tax escrow payments so they
   * don't get mistaken for one-time expenses.
   */
  // ── Descriptor normalization ──
  // Bank descriptors for ACH deposits embed dates and trace IDs, e.g.
  // "ORIG CO NAME:TCS MGT LLC 3135 ORIG ID:471634599 DESC DATE:260820 CO ENTRY..."
  // Those make every transaction look unique. Extract the stable payer identity
  // so repeat payments from the same source group together.
  const normalizeDescriptor = (tx) => {
    if (tx.merchant_name) return tx.merchant_name.toLowerCase().trim();
    let s = (tx.name || '').toUpperCase();

    // Pull the originating company name out of an ACH descriptor when present
    const origMatch = s.match(/ORIG(?:INATOR)?\s*CO(?:MPANY)?\s*NAME\s*:\s*([A-Z0-9 &.,'-]+?)(?=\s+(?:ORIG|DESC|CO |ID:|ENTRY|SEC:|$))/);
    if (origMatch) s = origMatch[1];

    return s
      .replace(/\b(?:ORIG|DESC|CO|ID|DATE|ENTRY|SEC|REF|TRN|PPD|CCD|WEB|ACH|DEPOSIT|PAYMENT)\b[:\s]*/g, ' ')
      .replace(/\d{4,}/g, ' ')
      .replace(/[^A-Z& ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase() || null;
  };

  // Human-readable version of a descriptor for display in the UI
  const cleanLabel = (tx) => {
    if (tx.merchant_name) return tx.merchant_name;
    const norm = normalizeDescriptor(tx);
    if (!norm) return null;
    return norm.replace(/\b\w/g, c => c.toUpperCase());
  };

  const debitTxs = transactions.filter(t => t.amount > 0);
  const seriesMap = new Map();
  for (const tx of debitTxs) {
    // Group by merchant when available, else by rounded amount bucket (nearest $5)
    const key = normalizeDescriptor(tx) || `amt_${Math.round(tx.amount / 5) * 5}`;
    if (!seriesMap.has(key)) seriesMap.set(key, []);
    seriesMap.get(key).push(tx);
  }

  const recurringKeys = new Set();
  const recurringSeries = [];
  for (const [key, txs] of seriesMap) {
    if (txs.length < 3) continue;                       // need 3+ occurrences
    const amounts = txs.map(t => t.amount);
    const avg     = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    // Amounts must be consistent (within 15% of the average)
    const consistent = amounts.every(a => Math.abs(a - avg) <= avg * 0.15);
    if (!consistent) continue;
    // Occurrences must land in distinct months (monthly cadence)
    const monthsSeen = new Set(txs.map(t => t.date.slice(0, 7)));
    if (monthsSeen.size < 3) continue;

    recurringKeys.add(key);
    recurringSeries.push({
      key,
      label:  txs[0].merchant_name || cleanLabel(txs[0]) || 'Recurring payment',
      avgAmount: Math.round(avg),
      count:  txs.length,
    });
  }
  const seriesKeyOf = (tx) =>
    normalizeDescriptor(tx) || `amt_${Math.round(tx.amount / 5) * 5}`;
  const isRecurringDebit = (tx) => tx.amount > 0 && recurringKeys.has(seriesKeyOf(tx));

  // The mortgage is the recurring series closest to the expected payment.
  // If we have no expectation at all, take the largest recurring series —
  // for a rental property account that is almost always the mortgage.
  let mortgageKey = null;
  if (recurringSeries.length) {
    if (expectedMortgage) {
      const candidates = recurringSeries
        .filter(s => s.avgAmount >= expectedMortgage * 0.8 && s.avgAmount <= expectedMortgage * 1.2)
        .sort((a, b) => Math.abs(a.avgAmount - expectedMortgage) - Math.abs(b.avgAmount - expectedMortgage));
      mortgageKey = candidates[0]?.key || null;
    }
    if (!mortgageKey) {
      const largest = [...recurringSeries].sort((a, b) => b.avgAmount - a.avgAmount)[0];
      // Only assume it's the mortgage if it's a substantial recurring payment
      if (largest && largest.avgAmount >= 300) mortgageKey = largest.key;
    }
  }

  // ── Rent sources (tenants) ──
  // A multifamily has one deposit per unit, so matching a single deposit against
  // the TOTAL expected rent fails. Instead detect recurring credit series — each
  // is a paying tenant — which also enables per-unit vacancy detection.
  const creditTxs = transactions.filter(t => t.amount < 0);
  const creditSeriesMap = new Map();
  for (const tx of creditTxs) {
    const inflow = Math.abs(tx.amount);
    // Group by normalized payer identity; only fall back to amount buckets when
    // there is no usable descriptor at all.
    const key = normalizeDescriptor(tx) || `amt_${Math.round(inflow / 25) * 25}`;
    if (!creditSeriesMap.has(key)) creditSeriesMap.set(key, []);
    creditSeriesMap.get(key).push(tx);
  }

  const rentSourceKeys = new Set();
  const rentSources    = [];
  for (const [key, txs] of creditSeriesMap) {
    const monthsSeen = new Set(txs.map(t => t.date.slice(0, 7)));
    if (monthsSeen.size < 2) continue;                 // must repeat across months
    const amounts = txs.map(t => Math.abs(t.amount));
    const avg     = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    if (avg < 200) continue;                           // ignore trivial deposits

    // NOTE: no amount-consistency requirement. When a property manager collects
    // rent and nets out their fees and repairs, the deposit legitimately varies
    // month to month. Payer identity + monthly cadence is the reliable signal.
    rentSourceKeys.add(key);
    rentSources.push({
      key,
      label:      txs[0].merchant_name || cleanLabel(txs[0]) || 'Rent deposit',
      avgAmount:  Math.round(avg),
      minAmount:  Math.round(Math.min(...amounts)),
      maxAmount:  Math.round(Math.max(...amounts)),
      varies:     Math.max(...amounts) - Math.min(...amounts) > avg * 0.15,
      count:      txs.length,
      monthsPaid: [...monthsSeen].sort(),
    });
  }
  const creditKeyOf = (tx) =>
    normalizeDescriptor(tx) || `amt_${Math.round(Math.abs(tx.amount) / 25) * 25}`;

  const isRent = (tx) => {
    if (tx.amount >= 0) return false;
    // Primary signal: it belongs to a recurring tenant series
    if (rentSourceKeys.has(creditKeyOf(tx))) return true;
    // Fallback for accounts with too little history to establish a pattern
    if (rentSources.length === 0) {
      const inflow = Math.abs(tx.amount);
      if (expectedRent) {
        // Compare against the total AND plausible per-unit splits (halves/thirds)
        for (const divisor of [1, 2, 3, 4]) {
          const unit = expectedRent / divisor;
          if (inflow >= unit * 0.7 && inflow <= unit * 1.3) return true;
        }
        return false;
      }
      return inflow >= 300;
    }
    return false;
  };
  const isMortgage = (tx) => tx.amount > 0 && mortgageKey != null && seriesKeyOf(tx) === mortgageKey;

  const detectedMortgage = mortgageKey
    ? recurringSeries.find(s => s.key === mortgageKey)
    : null;

  // ── Group by month ──
  const monthKey = (d) => d.slice(0, 7);
  const months = {};
  for (const tx of transactions) {
    const key = monthKey(tx.date);
    if (!months[key]) months[key] = { rentIncome: 0, otherIncome: 0, mortgage: 0, otherExpenses: 0 };
    const m = months[key];
    if (isRent(tx))          m.rentIncome    += Math.abs(tx.amount);
    else if (tx.amount < 0)  m.otherIncome   += Math.abs(tx.amount);
    else if (isMortgage(tx)) m.mortgage      += tx.amount;
    else                     m.otherExpenses += tx.amount;
  }

  const nowKey = monthKey(fmt(end));
  const monthRows = Object.entries(months)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, m]) => ({
      month:    key,
      complete: key !== nowKey,
      rentIncome:    Math.round(m.rentIncome),
      otherIncome:   Math.round(m.otherIncome),
      mortgage:      Math.round(m.mortgage),
      otherExpenses: Math.round(m.otherExpenses),
      net: Math.round(m.rentIncome + m.otherIncome - m.mortgage - m.otherExpenses),
    }));

  const complete = monthRows.filter(r => r.complete);
  const avg = (arr, key) => arr.length ? Math.round(arr.reduce((s, r) => s + r[key], 0) / arr.length) : 0;

  // ── Exclude months the user has logged as a vacancy ──
  // A single missed rent payment would otherwise drag the rolling average far
  // below normal operating performance. Once the user logs that month as a
  // vacancy event, they have told us it was a known one-off — so it is kept in
  // the monthly history (for accuracy) but excluded from the average.
  const loggedVacancyMonths = new Set(
    (property.events || [])
      .filter(e => e.type === 'vacancy')
      .map(e => new Date(e.date).toISOString().slice(0, 7))
  );

  const representative = complete.filter(r => !loggedVacancyMonths.has(r.month));
  const excludedMonths = complete
    .filter(r => loggedVacancyMonths.has(r.month))
    .map(r => r.month);

  // Fall back to all complete months if every month was logged as a vacancy,
  // so the figures never become null just because the property sat empty.
  const basis  = representative.length ? representative : complete;
  const recent = basis.slice(0, 6);

  const actualMonthlyCashFlow = recent.length ? avg(recent, 'net') : null;
  const actualMonthlyRent     = recent.length ? avg(recent, 'rentIncome') : null;

  // ── Vacancy detection ──
  // With known rent sources we can tell WHICH unit missed a month, which matters
  // for multifamily where one unit going vacant is a partial loss, not a total one.
  const completeMonthKeys = complete.map(r => r.month);
  const vacancyDetail = [];
  if (rentSources.length > 0) {
    for (const src of rentSources) {
      // Only consider months at or after this tenant's first observed payment
      const firstMonth = src.monthsPaid[0];
      const missed = completeMonthKeys.filter(mk => mk >= firstMonth && !src.monthsPaid.includes(mk));
      for (const mk of missed) {
        vacancyDetail.push({
          month:          mk,
          source:         src.label,
          expectedAmount: src.avgAmount,
        });
      }
    }
  } else if (expectedRent) {
    // No established sources — fall back to whole-property detection
    for (const r of complete) {
      if (r.rentIncome === 0) {
        vacancyDetail.push({ month: r.month, source: null, expectedAmount: expectedRent });
      }
    }
  }
  vacancyDetail.sort((a, b) => b.month.localeCompare(a.month));

  // Flag which detected vacancies the user has already logged — those are
  // resolved and should no longer prompt for action.
  for (const v of vacancyDetail) {
    v.logged = loggedVacancyMonths.has(v.month);
  }
  const unloggedVacancies = vacancyDetail.filter(v => !v.logged);
  const vacancyMonths = [...new Set(vacancyDetail.map(v => v.month))];

  // ── Large unusual expense suggestions ──
  // Only genuinely one-off charges: exclude anything on a recurring monthly
  // cadence (mortgage, insurance, HOA, escrow) so they aren't double-counted.
  const oneOffDebits = transactions.filter(tx => tx.amount > 0 && !isRecurringDebit(tx));
  const sorted = oneOffDebits.map(t => t.amount).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const alreadyLogged = new Set(
    (property.events || []).map(e => `${new Date(e.date).toISOString().slice(0, 10)}_${Math.round(e.amount)}`)
  );
  const largeExpenses = oneOffDebits
    .filter(tx =>
      tx.amount >= 500 &&
      (median === 0 || tx.amount >= median * 3) &&
      !alreadyLogged.has(`${tx.date}_${Math.round(tx.amount)}`)
    )
    .slice(0, 10)
    .map(tx => ({
      date:     tx.date,
      amount:   Math.round(tx.amount),
      name:     tx.merchant_name || tx.name || 'Unknown',
      category: tx.personal_finance_category?.primary || tx.category?.[0] || null,
    }));

  // ── Reserve ──
  const monthlyExpenses = recent.length
    ? avg(recent, 'mortgage') + avg(recent, 'otherExpenses')
    : (property.userInputs ? null : null);
  const reserveMonths = (currentBalance != null && monthlyExpenses > 0)
    ? +(currentBalance / monthlyExpenses).toFixed(1)
    : null;

  return {
    linkedAccountName: property.linkedAccountName,
    currentBalance,
    actual: {
      monthlyCashFlow: actualMonthlyCashFlow,
      monthlyRent:     actualMonthlyRent,
      annualCashFlow:  actualMonthlyCashFlow != null ? actualMonthlyCashFlow * 12 : null,
      monthsAnalyzed:  recent.length,
      excludedMonths,                                  // logged vacancies left out of the average
      excludedCount:   excludedMonths.length,
    },
    months: monthRows,
    vacancyMonths,
    vacancyDetail,
    unloggedVacancies,
    rentSources: rentSources.map(s => ({
      label:      s.label,
      avgAmount:  s.avgAmount,
      count:      s.count,
      monthsPaid: s.monthsPaid,
    })),
    largeExpenses,
    detection: {
      mortgage: detectedMortgage ? {
        label:     detectedMortgage.label,
        amount:    detectedMortgage.avgAmount,
        occurrences: detectedMortgage.count,
      } : null,
      expectedMortgage: expectedMortgage ? Math.round(expectedMortgage) : null,
      recurringSeries: recurringSeries
        .filter(s => s.key !== mortgageKey)
        .map(s => ({ label: s.label, amount: s.avgAmount, occurrences: s.count })),
    },
    reserve: {
      balance:           currentBalance,
      monthlyExpenses:   monthlyExpenses != null ? Math.round(monthlyExpenses) : null,
      monthsOfReserve:   reserveMonths,
      recommendedMonths: 6,
    },
    computedAt: new Date(),
  };
}

/**
 * Returns cached actuals for a property, re-deriving if stale.
 * Never throws — returns null if unavailable so page loads aren't blocked.
 */
async function getCachedActuals(user, property, { force = false } = {}) {
  if (!property.linkedAccountId) return null;

  const cached = property.actuals;
  const fresh  = cached?.computedAt &&
                 (Date.now() - new Date(cached.computedAt).getTime()) < ACTUALS_TTL_MS;
  if (fresh && !force) return cached;

  try {
    const result = await computePropertyFinancials(user, property);
    if (result.error) return cached || null;   // fall back to stale cache on error

    // Persist a compact snapshot (not the full month rows — those stay on demand)
    property.actuals = {
      monthlyCashFlow: result.actual.monthlyCashFlow,
      annualCashFlow:  result.actual.annualCashFlow,
      monthlyRent:     result.actual.monthlyRent,
      monthsAnalyzed:  result.actual.monthsAnalyzed,
      excludedCount:   result.actual.excludedCount,
      currentBalance:  result.currentBalance,
      monthsOfReserve: result.reserve.monthsOfReserve,
      vacancyCount:    result.unloggedVacancies.length,
      computedAt:      result.computedAt,
    };
    return property.actuals;
  } catch (_) {
    return cached || null;
  }
}

// ─── GET /property/:propertyId/financials ────────────────────────────────────
export const getPropertyFinancials = async (req, res, next) => {
  try {
    const { propertyId } = req.params;

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const property = findProperty(user, propertyId);
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const result = await computePropertyFinancials(user, property);

    if (result.error === 'NOT_LINKED') {
      return res.status(400).json({ error: 'No bank account linked to this property', code: 'NOT_LINKED' });
    }
    if (result.error === 'ITEM_GONE') {
      return res.status(400).json({ error: 'Linked bank connection no longer exists', code: 'ITEM_GONE' });
    }
    if (result.error === 'RECONNECT') {
      return res.status(400).json({ error: 'Bank connection expired — reconnect it from the Dashboard', code: 'RECONNECT' });
    }

    // Refresh the cached snapshot while we have fresh data
    property.actuals = {
      monthlyCashFlow: result.actual.monthlyCashFlow,
      annualCashFlow:  result.actual.annualCashFlow,
      monthlyRent:     result.actual.monthlyRent,
      monthsAnalyzed:  result.actual.monthsAnalyzed,
      excludedCount:   result.actual.excludedCount,
      currentBalance:  result.currentBalance,
      monthsOfReserve: result.reserve.monthsOfReserve,
      vacancyCount:    result.unloggedVacancies.length,
      computedAt:      result.computedAt,
    };
    await user.save();

    // Include the estimated figure for side-by-side comparison
    const estimated = buildPropertyResponse(property).cashFlow;
    res.json({
      ...result,
      estimated: { monthlyCashFlow: estimated?.monthly ?? null },
      difference: (result.actual.monthlyCashFlow != null && estimated?.monthly != null)
        ? result.actual.monthlyCashFlow - estimated.monthly
        : null,
    });
  } catch (err) {
    next(err);
  }
};
