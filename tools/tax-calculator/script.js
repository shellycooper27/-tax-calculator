// ---------------------------------------------------------------------------
// Tax rules configuration. Same slabs are used for FY 2025-26 and FY 2026-27
// because no newer Budget change is known as of this build — edit the two
// objects below if a later Budget revises rates.
// ---------------------------------------------------------------------------

const CONFIG = {
  "2025-26": { new: newRegimeRules(), old: oldRegimeRules() },
  "2026-27": { new: newRegimeRules(), old: oldRegimeRules() },
};

function newRegimeRules() {
  return {
    standardDeduction: 75000,
    familyPensionDeductionCap: 25000,
    slabs: [
      { upto: 400000, rate: 0 },
      { upto: 800000, rate: 0.05 },
      { upto: 1200000, rate: 0.10 },
      { upto: 1600000, rate: 0.15 },
      { upto: 2000000, rate: 0.20 },
      { upto: 2400000, rate: 0.25 },
      { upto: Infinity, rate: 0.30 },
    ],
    basicExemption: 400000,
    rebateLimit: 1200000,
    rebateMax: 60000,
    maxSurchargeRate: 0.25, // new regime surcharge capped at 25%
  };
}

function oldRegimeRules() {
  const below60Slabs = [
    { upto: 250000, rate: 0 },
    { upto: 500000, rate: 0.05 },
    { upto: 1000000, rate: 0.20 },
    { upto: Infinity, rate: 0.30 },
  ];
  return {
    standardDeduction: 50000,
    familyPensionDeductionCap: 15000,
    slabsByAge: {
      below60: below60Slabs,
      // Non-residents, HUF, AOP/BOI, and AJP always follow the below-60
      // slab structure — no senior-citizen exemption applies to them.
      nonresident: below60Slabs,
      huf: below60Slabs,
      aopboi: below60Slabs,
      ajp: below60Slabs,
      senior: [
        { upto: 300000, rate: 0 },
        { upto: 500000, rate: 0.05 },
        { upto: 1000000, rate: 0.20 },
        { upto: Infinity, rate: 0.30 },
      ],
      supersenior: [
        { upto: 500000, rate: 0 },
        { upto: 1000000, rate: 0.20 },
        { upto: Infinity, rate: 0.30 },
      ],
    },
    // Non-residents, HUF, AOP/BOI, and Artificial Juridical Persons do not
    // get the senior-citizen exemption slabs — they always use the below-60
    // slab structure, regardless of the individual member's actual age.
    basicExemptionByAge: {
      below60: 250000, senior: 300000, supersenior: 500000,
      nonresident: 250000, huf: 250000, aopboi: 250000, ajp: 250000,
    },
    rebateLimit: 500000,
    rebateMax: 12500,
    maxSurchargeRate: 0.37,
  };
}

const SURCHARGE_BRACKETS = [
  { upto: 5000000, rate: 0 },
  { upto: 10000000, rate: 0.10 },
  { upto: 20000000, rate: 0.15 },
  { upto: 50000000, rate: 0.25 },
  { upto: Infinity, rate: 0.37 }, // capped by maxSurchargeRate per regime
];

const CESS_RATE = 0.04;
const LTCG_EXEMPTION = 125000;
const LTCG_RATE = 0.125;
const STCG_111A_RATE = 0.20;
const LOTTERY_RATE = 0.30;
const GAMING_RATE = 0.30;
const VDA_RATE = 0.30;
const UNEXPLAINED_RATE = 0.60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  // Money fields are formatted with Indian comma grouping as the user
  // types (e.g. "25,00,000") — strip the commas before parsing.
  const v = parseFloat(String(el.value).replace(/,/g, ""));
  return isNaN(v) ? 0 : v;
}

// ---------------------------------------------------------------------------
// Live Indian-comma formatting for money inputs (e.g. 2500000 -> 25,00,000)
// ---------------------------------------------------------------------------

function formatIndianDigits(rawDigits) {
  return rawDigits ? Number(rawDigits).toLocaleString("en-IN") : "";
}

// Sets a money-input's displayed value from a plain number/string, applying
// Indian comma formatting. Used whenever a value is set programmatically
// (sample data, save/load, scenario load) rather than typed.
function setMoneyInputValue(el, value) {
  let raw = String(value).replace(/[^0-9-]/g, "");
  const negative = raw.startsWith("-");
  raw = raw.replace(/-/g, "");
  el.value = (negative ? "-" : "") + formatIndianDigits(raw);
}

function attachMoneyFormatting(el) {
  el.addEventListener("input", () => {
    // Preserve the cursor's distance from the end of the string — robust
    // for the common case of typing/deleting at or near the end, which
    // covers the vast majority of real edits to these fields.
    const distanceFromEnd = el.value.length - el.selectionStart;

    let raw = el.value.replace(/[^0-9-]/g, "");
    const negative = raw.startsWith("-");
    raw = raw.replace(/-/g, "").replace(/^0+(?=\d)/, "");

    const formatted = (negative ? "-" : "") + formatIndianDigits(raw);
    el.value = formatted;

    const newPos = Math.max(formatted.length - distanceFromEnd, 0);
    el.setSelectionRange(newPos, newPos);
  });
}

function inr(n) {
  n = Math.round(n);
  return "₹" + n.toLocaleString("en-IN");
}

function slabTax(income, slabs) {
  let tax = 0;
  let prevUpto = 0;
  for (const slab of slabs) {
    if (income <= prevUpto) break;
    const taxableInSlab = Math.min(income, slab.upto) - prevUpto;
    if (taxableInSlab > 0) tax += taxableInSlab * slab.rate;
    prevUpto = slab.upto;
  }
  return tax;
}

function surchargeRate(totalIncome, maxRate) {
  let rate = 0;
  for (const b of SURCHARGE_BRACKETS) {
    if (totalIncome <= b.upto) { rate = b.rate; break; }
  }
  return Math.min(rate, maxRate);
}

// ---------------------------------------------------------------------------
// Head 1: Salary
// ---------------------------------------------------------------------------

function salaryIncome(inputs, regime, rules) {
  // Standard deduction u/s 16(ia) and HRA exemption u/s 10(13A) are only
  // relevant for salaried employees and pensioners.
  if (inputs.taxpayerType === "business" || inputs.taxpayerType === "other") {
    return { grossTotal: 0, hraExemption: 0, taxable: 0 };
  }

  const grossTotal = inputs.grossSalary + inputs.basicDA + inputs.daTerms
    + inputs.hraReceived + inputs.perquisites + inputs.arrears;

  let hraExemption = 0;
  if (regime === "old" && inputs.hraReceived > 0) {
    const pctOfBasic = inputs.metroCity === "metro" ? 0.5 : 0.4;
    hraExemption = Math.max(0, Math.min(
      inputs.hraReceived,
      inputs.rentPaid - 0.10 * inputs.basicDA,
      pctOfBasic * inputs.basicDA
    ));
  }

  const professionalTaxDed = regime === "old" ? inputs.professionalTax : 0;
  const exemptAllowancesDed = inputs.exemptAllowances; // u/s 10, allowed both regimes

  const taxable = Math.max(
    grossTotal - exemptAllowancesDed - professionalTaxDed - hraExemption - rules.standardDeduction,
    0
  );

  return { grossTotal, hraExemption, taxable };
}

// ---------------------------------------------------------------------------
// Head 2: House Property
// ---------------------------------------------------------------------------

function houseProperty(inputs, regime) {
  const coOwnerFactor = Math.min(Math.max(inputs.coOwnerShare, 0), 100) / 100;

  const nav = Math.max(inputs.letOutRent - inputs.municipalTax, 0);
  const standardDed = nav * 0.30;
  const preConstruction = inputs.preConstructionInterest / 5;
  let letOutIncome = (nav - standardDed - inputs.letOutInterest - preConstruction) * coOwnerFactor;

  let selfOccupiedLoss = 0;
  if (regime === "old") {
    selfOccupiedLoss = -Math.min(inputs.selfOccupiedInterest, 200000);
  }
  // Self-occupied interest is disallowed entirely under the new regime.

  let total = letOutIncome + selfOccupiedLoss;
  total = Math.max(total, -200000); // loss set-off against other heads capped at ₹2L
  return total;
}

// ---------------------------------------------------------------------------
// Head 3: Business / Profession
// ---------------------------------------------------------------------------

// Brought-forward and current-year business losses can be set off only
// intra-head, against current-year business profit (s.72) — never against
// other heads directly. Any loss beyond available profit is simply
// unutilised here (carry-forward across years is out of scope).
function businessIncome(inputs) {
  const regular = inputs.netProfit
    + inputs.addDisallowances
    + inputs.addOtherAdditions
    - inputs.lessAllowableDeductions
    - inputs.depreciationAdjustment;

  let profit = regular + inputs.presumptive44AD + inputs.presumptive44ADA + inputs.presumptive44AE;

  if (profit > 0) {
    const cyLossUsed = Math.min(inputs.currentYearBusinessLoss, profit);
    profit -= cyLossUsed;
    const bfLossUsed = Math.min(inputs.broughtForwardBusinessLoss, profit);
    profit -= bfLossUsed;
  }
  return profit;
}

// ---------------------------------------------------------------------------
// Head 5: Other Sources
// ---------------------------------------------------------------------------

function otherSourcesSlabPortion(inputs, rules) {
  const familyPensionDeduction = Math.min(inputs.familyPension / 3, rules.familyPensionDeductionCap);
  const familyPensionNet = Math.max(inputs.familyPension - familyPensionDeduction, 0);

  return inputs.savingsInterest + inputs.fdInterest + inputs.dividendIncome
    + familyPensionNet + inputs.otherIncomeSlab;
}

// ---------------------------------------------------------------------------
// Agricultural income partial integration
// ---------------------------------------------------------------------------

function applyAgriIntegration(nonAgriTaxableIncome, agriIncome, slabs, basicExemption) {
  if (agriIncome <= 5000 || nonAgriTaxableIncome <= basicExemption) {
    return slabTax(nonAgriTaxableIncome, slabs);
  }
  const taxOnCombined = slabTax(nonAgriTaxableIncome + agriIncome, slabs);
  const taxOnExemptionPlusAgri = slabTax(basicExemption + agriIncome, slabs);
  return Math.max(taxOnCombined - taxOnExemptionPlusAgri, 0);
}

// ---------------------------------------------------------------------------
// Core computation for one regime
// ---------------------------------------------------------------------------

function computeRegime(regime, fy, age, inputs) {
  const rules = CONFIG[fy][regime];
  const slabs = regime === "new" ? rules.slabs : rules.slabsByAge[age];
  const basicExemption = regime === "new" ? rules.basicExemption : rules.basicExemptionByAge[age];

  const sal = salaryIncome(inputs, regime, rules);
  const hp = houseProperty(inputs, regime);
  const biz = businessIncome(inputs);
  const otherSlab = otherSourcesSlabPortion(inputs, rules);

  const sec80CCD2 = regime === "old" ? inputs.sec80CCD2_old : inputs.sec80CCD2_new;

  let deductions = 0;
  if (regime === "old") {
    const sec80CCE = Math.min(inputs.sec80C + inputs.sec80CCC + inputs.sec80CCD1, 150000);
    deductions += sec80CCE;
    deductions += Math.min(inputs.sec80CCD1B, 50000);
    deductions += sec80CCD2;
    deductions += inputs.sec80D;
    deductions += inputs.sec80DD;
    deductions += inputs.sec80DDB;
    deductions += inputs.sec80E;
    deductions += inputs.sec80EE;
    deductions += inputs.sec80EEA;
    deductions += inputs.sec80G;
    deductions += inputs.sec80GG;
    deductions += inputs.sec80GGA;
    deductions += inputs.sec80GGC;
    // 80TTA (savings interest) is available to individuals and HUF; 80TTB
    // (all interest, higher cap) is restricted to resident senior citizens
    // and excludes 80TTA for them. AOP/BOI/AJP/non-residents get neither.
    if (age === "below60" || age === "huf") {
      deductions += Math.min(inputs.sec80TTA, 10000);
    } else if (age === "senior" || age === "supersenior") {
      deductions += Math.min(inputs.sec80TTB, 50000);
    }
    deductions += inputs.sec80U;
    deductions += inputs.otherDeductions;
  } else {
    // New regime allows only a limited list u/s 115BAC.
    deductions += sec80CCD2;
    deductions += inputs.sec80CCH2;
    deductions += inputs.sec80JJAA;
    deductions += inputs.sec80LA3A;
  }

  // ---- Capital-gains pool (special-rate, eligible for business-loss
  // set-off and for absorbing unutilised basic exemption) ----
  let stcg111AAmt = inputs.stcg111A;
  let ltcg112Amt = inputs.ltcg112;
  let ltcg112AAmt = Math.max(inputs.ltcg112A - LTCG_EXEMPTION, 0);

  // ---- Business-head loss (s.71): set off against any head EXCEPT salary,
  // and never against lottery/game-show/online-gaming/VDA/unexplained
  // income (set-off of losses is statutorily barred for those). ----
  const normalPoolBeforeBiz = hp + otherSlab + inputs.stcgSlab;
  let normalPoolAfterBiz = normalPoolBeforeBiz;
  if (biz < 0) {
    let loss = -biz;
    const usableNormalPool = Math.max(normalPoolBeforeBiz, 0);
    const absorbedNormal = Math.min(loss, usableNormalPool);
    normalPoolAfterBiz = normalPoolBeforeBiz - absorbedNormal;
    loss -= absorbedNormal;

    const absorb111A = Math.min(loss, stcg111AAmt);
    stcg111AAmt -= absorb111A; loss -= absorb111A;
    const absorb112 = Math.min(loss, ltcg112Amt);
    ltcg112Amt -= absorb112; loss -= absorb112;
    const absorb112A = Math.min(loss, ltcg112AAmt);
    ltcg112AAmt -= absorb112A; loss -= absorb112A;
    // Any loss still remaining is unabsorbed this year (carry-forward not modelled).
  }

  const gti = sal.taxable + Math.max(biz, 0) + normalPoolAfterBiz;
  const normalTaxableIncome = Math.max(gti - deductions, 0);

  // ---- Unutilised basic exemption set off against capital gains, most
  // heavily taxed first (taxpayer-beneficial, as permitted by the 111A/
  // 112/112A provisos for resident individuals/HUFs). Not available to
  // lottery/gaming/VDA/unexplained income. ----
  let shortfall = Math.max(basicExemption - normalTaxableIncome, 0);
  const exempt111A = Math.min(shortfall, stcg111AAmt);
  stcg111AAmt -= exempt111A; shortfall -= exempt111A;
  const exempt112 = Math.min(shortfall, ltcg112Amt);
  ltcg112Amt -= exempt112; shortfall -= exempt112;
  const exempt112A = Math.min(shortfall, ltcg112AAmt);
  ltcg112AAmt -= exempt112A; shortfall -= exempt112A;

  const capGainsIncome = stcg111AAmt + ltcg112Amt + ltcg112AAmt;
  const capGainsTax = stcg111AAmt * STCG_111A_RATE + ltcg112Amt * LTCG_RATE + ltcg112AAmt * LTCG_RATE;

  // Lottery / online gaming / VDA: flat rate, no exemption, no loss set-off.
  const otherSpecialIncome = inputs.lottery115BB + inputs.onlineGaming115BBJ + inputs.vda115BBH;
  const otherSpecialTax = inputs.lottery115BB * LOTTERY_RATE
    + inputs.onlineGaming115BBJ * GAMING_RATE
    + inputs.vda115BBH * VDA_RATE;

  // Unexplained income u/s 115BBE: flat 60% + mandatory 25% surcharge,
  // irrespective of total income — kept fully separate from normal surcharge slabs.
  const unexplainedTax = inputs.unexplained115BBE * UNEXPLAINED_RATE;
  const unexplainedSurcharge = unexplainedTax * 0.25;

  const totalTaxableIncome = normalTaxableIncome + capGainsIncome + otherSpecialIncome + inputs.unexplained115BBE;

  let slabTaxAmount = applyAgriIntegration(normalTaxableIncome, inputs.agriIncome, slabs, basicExemption);

  // Section 87A rebate is available only to a "resident individual" — HUF,
  // AOP/BOI, Artificial Juridical Persons, and non-residents get no rebate
  // at all, regardless of income level. Marginal relief, where applicable,
  // applies only against tax on normal slab income (not against tax on
  // 111A/112/112A capital gains, or lottery/gaming/VDA/115BBE income).
  const residentIndividual = age === "below60" || age === "senior" || age === "supersenior";
  let rebate = 0;
  if (residentIndividual) {
    if (totalTaxableIncome <= rules.rebateLimit) {
      rebate = Math.min(slabTaxAmount, rules.rebateMax);
    } else {
      const incomeAboveLimit = totalTaxableIncome - rules.rebateLimit;
      if (incomeAboveLimit < slabTaxAmount) {
        rebate = slabTaxAmount - incomeAboveLimit; // marginal relief
      }
    }
  }
  const slabTaxAfterRebate = Math.max(slabTaxAmount - rebate, 0);

  // Surcharge: slab tax + lottery/gaming/VDA tax follow the regular
  // slab-based surcharge (capped at the regime max). Tax on capital gains
  // u/s 111A/112/112A is capped at a 15% surcharge regardless of total
  // income (post-Budget 2024 relief). 115BBE carries its own fixed 25%.
  const generalRate = surchargeRate(totalTaxableIncome, rules.maxSurchargeRate);
  const capGainsRate = Math.min(generalRate, 0.15);

  const baseTax = slabTaxAfterRebate + otherSpecialTax;
  const baseSurcharge = baseTax * generalRate;
  const capGainsSurcharge = capGainsTax * capGainsRate;

  const taxBeforeCess = baseTax + capGainsTax + unexplainedTax;
  const surcharge = baseSurcharge + capGainsSurcharge + unexplainedSurcharge;

  const cess = (taxBeforeCess + surcharge) * CESS_RATE;

  const totalTax = Math.max(taxBeforeCess + surcharge + cess - inputs.relief89, 0);

  const prepaidTaxes = inputs.tds + inputs.tcs + inputs.advanceTax + inputs.selfAssessmentTax;
  const netPayable = totalTax - prepaidTaxes;

  return {
    regime,
    salaryTaxable: sal.taxable,
    hraExemption: sal.hraExemption,
    houseProperty: hp,
    businessIncome: biz,
    otherSlab,
    gti,
    deductions,
    normalTaxableIncome,
    specialIncome: capGainsIncome + otherSpecialIncome + inputs.unexplained115BBE,
    totalTaxableIncome,
    slabTaxAmount,
    rebate,
    slabTaxAfterRebate,
    specialTax: capGainsTax + otherSpecialTax + unexplainedTax,
    taxBeforeRelief: taxBeforeCess,
    surchargeRate: generalRate,
    surcharge,
    cess,
    relief89: inputs.relief89,
    totalTax,
    prepaidTaxes,
    netPayable,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function readInputs() {
  return {
    // Salary
    grossSalary: num("grossSalary"),
    basicDA: num("basicDA"),
    daTerms: num("daTerms"),
    hraReceived: num("hraReceived"),
    rentPaid: num("rentPaid"),
    professionalTax: num("professionalTax"),
    perquisites: num("perquisites"),
    arrears: num("arrears"),
    metroCity: document.getElementById("metroCity").value,
    taxpayerType: document.getElementById("taxpayerType").value,
    exemptAllowances: num("exemptAllowances"),

    // House property
    selfOccupiedInterest: num("selfOccupiedInterest"),
    letOutRent: num("letOutRent"),
    municipalTax: num("municipalTax"),
    letOutInterest: num("letOutInterest"),
    preConstructionInterest: num("preConstructionInterest"),
    coOwnerShare: num("coOwnerShare"),

    // Business / profession
    netProfit: num("netProfit"),
    addDisallowances: num("addDisallowances"),
    addOtherAdditions: num("addOtherAdditions"),
    lessAllowableDeductions: num("lessAllowableDeductions"),
    depreciationAdjustment: num("depreciationAdjustment"),
    presumptive44AD: num("presumptive44AD"),
    presumptive44ADA: num("presumptive44ADA"),
    presumptive44AE: num("presumptive44AE"),
    broughtForwardBusinessLoss: num("broughtForwardBusinessLoss"),
    currentYearBusinessLoss: num("currentYearBusinessLoss"),

    // Capital gains
    stcgSlab: num("stcgSlab"),
    stcg111A: num("stcg111A"),
    ltcg112A: num("ltcg112A"),
    ltcg112: num("ltcg112"),

    // Other sources
    savingsInterest: num("savingsInterest"),
    fdInterest: num("fdInterest"),
    dividendIncome: num("dividendIncome"),
    familyPension: num("familyPension"),
    lottery115BB: num("lottery115BB"),
    onlineGaming115BBJ: num("onlineGaming115BBJ"),
    vda115BBH: num("vda115BBH"),
    unexplained115BBE: num("unexplained115BBE"),
    otherIncomeSlab: num("otherIncomeSlab"),

    // Agricultural income
    agriIncome: num("agriIncome"),

    // Deductions — old regime
    sec80C: num("sec80C"),
    sec80CCC: num("sec80CCC"),
    sec80CCD1: num("sec80CCD1"),
    sec80CCD1B: num("sec80CCD1B"),
    sec80CCD2_old: num("sec80CCD2_old"),
    sec80D: num("sec80D"),
    sec80DD: num("sec80DD"),
    sec80DDB: num("sec80DDB"),
    sec80E: num("sec80E"),
    sec80EE: num("sec80EE"),
    sec80EEA: num("sec80EEA"),
    sec80G: num("sec80G"),
    sec80GG: num("sec80GG"),
    sec80GGA: num("sec80GGA"),
    sec80GGC: num("sec80GGC"),
    sec80TTA: num("sec80TTA"),
    sec80TTB: num("sec80TTB"),
    sec80U: num("sec80U"),
    otherDeductions: num("otherDeductions"),

    // Deductions — new regime
    sec80CCD2_new: num("sec80CCD2_new"),
    sec80CCH2: num("sec80CCH2"),
    sec80JJAA: num("sec80JJAA"),
    sec80LA3A: num("sec80LA3A"),

    // Taxes paid & reliefs
    tds: num("tds"),
    tcs: num("tcs"),
    advanceTax: num("advanceTax"),
    selfAssessmentTax: num("selfAssessmentTax"),
    relief89: num("relief89"),
  };
}

function regimeCardHtml(result, label) {
  const r = result;
  const netLabel = r.netPayable >= 0 ? "Net Tax Payable" : "Net Refund Due";
  return `
    <div class="regime-card ${r.regime}">
      <span class="badge">${label}</span>
      <h3>Total Tax Liability</h3>
      <div class="total">${inr(r.totalTax)}</div>
      <div class="row"><span>Gross Total Income (incl. special rate)</span><span>${inr(r.gti + r.specialIncome)}</span></div>
      <div class="row"><span>HRA Exemption u/s 10(13A)</span><span>-${inr(r.hraExemption)}</span></div>
      <div class="row"><span>Deductions</span><span>-${inr(r.deductions)}</span></div>
      <div class="row"><span>Taxable Income (slab)</span><span>${inr(r.normalTaxableIncome)}</span></div>
      <div class="row"><span>Special rate income</span><span>${inr(r.specialIncome)}</span></div>
      <div class="row"><span>Tax on slab income <span class="info-i" title="${r.regime === "new" ? "Computed per the slab rates u/s 115BAC (New Regime)." : "Computed per the First Schedule slab rates (Old Regime)."}">ⓘ</span></span><span>${inr(r.slabTaxAmount)}</span></div>
      <div class="row"><span>Rebate u/s 87A</span><span>-${inr(r.rebate)}</span></div>
      <div class="row"><span>Tax on special rate income <span class="info-i" title="Tax on capital gains (Sec 111A/112/112A) and any lottery/gaming/VDA/115BBE income, at their respective special rates.">ⓘ</span></span><span>${inr(r.specialTax)}</span></div>
      <div class="row"><span>Surcharge (${(r.surchargeRate*100).toFixed(0)}%) <span class="info-i" title="Surcharge per the Finance Act rate schedule (10%/15%/25%/37%), capped at 25% under the New Regime and at 15% on Sec 111A/112/112A capital gains tax.">ⓘ</span></span><span>${inr(r.surcharge)}</span></div>
      <div class="row"><span>Health &amp; Education Cess (4%) <span class="info-i" title="Health & Education Cess — 4% on (tax + surcharge), levied under the Finance Act each year.">ⓘ</span></span><span>${inr(r.cess)}</span></div>
      <div class="row"><span>Relief u/s 89</span><span>-${inr(r.relief89)}</span></div>
      <div class="row total-row"><span>Total Tax Liability</span><span>${inr(r.totalTax)}</span></div>
      <div class="row"><span>Taxes Already Paid (TDS/TCS/Advance/SAT)</span><span>-${inr(r.prepaidTaxes)}</span></div>
      <div class="row total-row"><span>${netLabel}</span><span>${inr(Math.abs(r.netPayable))}</span></div>
    </div>
  `;
}

function slabTableHtml(fy, regime, age) {
  const rules = CONFIG[fy][regime];
  const slabs = regime === "new" ? rules.slabs : rules.slabsByAge[age];
  let prev = 0;
  let rows = "";
  for (const s of slabs) {
    const rangeLabel = s.upto === Infinity
      ? `Above ${inr(prev)}`
      : `${inr(prev)} - ${inr(s.upto)}`;
    rows += `<tr><td>${rangeLabel}</td><td>${(s.rate*100).toFixed(0)}%</td></tr>`;
    prev = s.upto;
  }
  return `
    <table class="slab-table">
      <thead><tr><th>Income Range</th><th>Rate</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

let lastNewResult = null;
let lastOldResult = null;

function render() {
  const fy = document.getElementById("fy").value;
  const age = document.getElementById("age").value;
  const view = document.getElementById("regimeToggle").value;
  const inputs = readInputs();

  const newResult = computeRegime("new", fy, age, inputs);
  const oldResult = computeRegime("old", fy, age, inputs);
  lastNewResult = newResult;
  lastOldResult = oldResult;

  let cardsHtml = "";
  if (view === "new" || view === "both") cardsHtml += regimeCardHtml(newResult, "New Regime");
  if (view === "old" || view === "both") cardsHtml += regimeCardHtml(oldResult, "Old Regime");

  let recommendHtml = "";
  if (view === "both") {
    const better = newResult.totalTax <= oldResult.totalTax ? "New" : "Old";
    const savings = Math.abs(newResult.totalTax - oldResult.totalTax);
    recommendHtml = `
      <div class="recommend">
        Based on the figures entered, the <strong>${better} Regime</strong> results in a lower tax liability,
        saving you approximately <strong>${inr(savings)}</strong> compared to the other regime.
      </div>
    `;
  }

  let slabHtml = "";
  if (view === "new" || view === "both") {
    slabHtml += `<div class="card"><h2>New Regime Slabs — FY ${fy}</h2>${slabTableHtml(fy, "new", age)}</div>`;
  }
  if (view === "old" || view === "both") {
    slabHtml += `<div class="card"><h2>Old Regime Slabs — FY ${fy}</h2>${slabTableHtml(fy, "old", age)}</div>`;
  }

  document.getElementById("results").innerHTML = `
    <div class="result-cards">${cardsHtml}</div>
    ${recommendHtml}
    ${slabHtml}
  `;

  updateSidebarSummary(newResult, oldResult, view);
}

function updateSidebarSummary(newResult, oldResult, view) {
  document.getElementById("sumOld").textContent = inr(oldResult.totalTax);
  document.getElementById("sumNew").textContent = inr(newResult.totalTax);

  const better = newResult.totalTax <= oldResult.totalTax ? "New Regime" : "Old Regime";
  const savings = Math.abs(newResult.totalTax - oldResult.totalTax);
  document.getElementById("sumRecommended").textContent = better;
  document.getElementById("sumSaving").textContent = inr(savings);

  const payable = view === "old" ? oldResult.totalTax
    : view === "new" ? newResult.totalTax
    : Math.min(newResult.totalTax, oldResult.totalTax);
  document.getElementById("sumPayable").textContent = inr(payable);
}

// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
    if (btn.dataset.tab === "scenarios") renderScenarioBuilder();
  });
});

// ---------------------------------------------------------------------------
// Sample data / Reset / Save / Load / Export / Print
// ---------------------------------------------------------------------------

const SAMPLE_DATA = {
  grossSalary: 200000, basicDA: 700000, daTerms: 0, hraReceived: 280000,
  rentPaid: 240000, professionalTax: 2400, perquisites: 0, arrears: 0,
  exemptAllowances: 25000, selfOccupiedInterest: 150000, letOutRent: 0,
  municipalTax: 0, letOutInterest: 0, preConstructionInterest: 0, coOwnerShare: 100,
  netProfit: 0, addDisallowances: 0, addOtherAdditions: 0, lessAllowableDeductions: 0,
  depreciationAdjustment: 0, presumptive44AD: 0, presumptive44ADA: 0, presumptive44AE: 0,
  broughtForwardBusinessLoss: 0, currentYearBusinessLoss: 0,
  stcgSlab: 0, stcg111A: 50000, ltcg112A: 200000, ltcg112: 0,
  savingsInterest: 8000, fdInterest: 12000, dividendIncome: 5000, familyPension: 0,
  lottery115BB: 0, onlineGaming115BBJ: 0, vda115BBH: 0, unexplained115BBE: 0, otherIncomeSlab: 0,
  agriIncome: 0,
  sec80C: 150000, sec80CCC: 0, sec80CCD1: 0, sec80CCD1B: 50000, sec80CCD2_old: 0,
  sec80D: 25000, sec80DD: 0, sec80DDB: 0, sec80E: 0, sec80EE: 0, sec80EEA: 0,
  sec80G: 0, sec80GG: 0, sec80GGA: 0, sec80GGC: 0, sec80TTA: 8000, sec80TTB: 0,
  sec80U: 0, otherDeductions: 0,
  sec80CCD2_new: 0, sec80CCH2: 0, sec80JJAA: 0, sec80LA3A: 0,
  tds: 90000, tcs: 0, advanceTax: 0, selfAssessmentTax: 0, relief89: 0,
};

function applySampleData() {
  Object.entries(SAMPLE_DATA).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.classList.contains("money-input")) setMoneyInputValue(el, val);
    else el.value = val;
  });
}

document.getElementById("calcBtn").addEventListener("click", render);

document.getElementById("resetBtn").addEventListener("click", () => {
  document.querySelectorAll('#tab-calculator input[type="number"], #tab-calculator .money-input').forEach(el => {
    if (el.classList.contains("money-input")) setMoneyInputValue(el, 0);
    else el.value = 0;
  });
  document.getElementById("coOwnerShare").value = 100;
  document.getElementById("results").innerHTML = "";
  document.getElementById("sumOld").textContent = "₹0";
  document.getElementById("sumNew").textContent = "₹0";
  document.getElementById("sumRecommended").textContent = "—";
  document.getElementById("sumSaving").textContent = "—";
  document.getElementById("sumPayable").textContent = "₹0";
});

document.getElementById("loadSampleBtn").addEventListener("click", () => {
  applySampleData();
  render();
});

document.getElementById("saveBtn").addEventListener("click", () => {
  const inputs = readInputs();
  const saved = {
    inputs,
    fy: document.getElementById("fy").value,
    age: document.getElementById("age").value,
    taxpayerType: document.getElementById("taxpayerType").value,
    regimeToggle: document.getElementById("regimeToggle").value,
    metroCity: document.getElementById("metroCity").value,
  };
  localStorage.setItem("taxCalcSaved", JSON.stringify(saved));
  alert("Inputs saved on this device.");
});

document.getElementById("loadSavedBtn").addEventListener("click", () => {
  const raw = localStorage.getItem("taxCalcSaved");
  if (!raw) { alert("No saved data found on this device."); return; }
  const saved = JSON.parse(raw);
  Object.entries(saved.inputs).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.classList.contains("money-input")) setMoneyInputValue(el, val);
    else if (el.type === "number") el.value = val;
  });
  if (saved.fy) document.getElementById("fy").value = saved.fy;
  if (saved.age) document.getElementById("age").value = saved.age;
  if (saved.taxpayerType) document.getElementById("taxpayerType").value = saved.taxpayerType;
  if (saved.regimeToggle) document.getElementById("regimeToggle").value = saved.regimeToggle;
  if (saved.metroCity) document.getElementById("metroCity").value = saved.metroCity;
  render();
});

document.getElementById("copySummaryBtn").addEventListener("click", () => {
  if (!lastNewResult || !lastOldResult) { alert("Click Calculate Tax first."); return; }
  const text = `Income Tax Summary\nOld Regime Tax: ${inr(lastOldResult.totalTax)}\nNew Regime Tax: ${inr(lastNewResult.totalTax)}\nRecommended: ${lastNewResult.totalTax <= lastOldResult.totalTax ? "New Regime" : "Old Regime"}\nEstimated Saving: ${inr(Math.abs(lastNewResult.totalTax - lastOldResult.totalTax))}`;
  navigator.clipboard.writeText(text).then(
    () => alert("Summary copied to clipboard."),
    () => alert(text)
  );
});

document.getElementById("exportCsvBtn").addEventListener("click", () => {
  if (!lastNewResult || !lastOldResult) { alert("Click Calculate Tax first."); return; }
  const rows = [
    ["Item", "Old Regime", "New Regime"],
    ["Taxable Income (slab)", lastOldResult.normalTaxableIncome, lastNewResult.normalTaxableIncome],
    ["Deductions", lastOldResult.deductions, lastNewResult.deductions],
    ["Tax on slab income", lastOldResult.slabTaxAmount, lastNewResult.slabTaxAmount],
    ["Rebate u/s 87A", lastOldResult.rebate, lastNewResult.rebate],
    ["Tax on special rate income", lastOldResult.specialTax, lastNewResult.specialTax],
    ["Surcharge", lastOldResult.surcharge, lastNewResult.surcharge],
    ["Cess", lastOldResult.cess, lastNewResult.cess],
    ["Total Tax Liability", lastOldResult.totalTax, lastNewResult.totalTax],
    ["Net Payable", lastOldResult.netPayable, lastNewResult.netPayable],
  ];
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "tax_summary.csv";
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("downloadPdfBtn").addEventListener("click", () => window.print());
document.getElementById("printBtn").addEventListener("click", () => window.print());

// ---------------------------------------------------------------------------
// Advance Tax Calculator
// ---------------------------------------------------------------------------

document.getElementById("advComputeBtn").addEventListener("click", () => {
  const age = document.getElementById("advAge").value;
  const regime = document.getElementById("advRegime").value;
  const income = num("advIncome");
  const tds = num("advTds");
  const tcs = num("advTcs");
  const relief = num("advRelief");
  const presumptive = document.getElementById("advPresumptive").checked;
  const paid = {
    jun: num("advJun"), sep: num("advSep"), dec: num("advDec"), mar: num("advMar"),
  };

  const rules = CONFIG["2026-27"][regime];
  const slabs = regime === "new" ? rules.slabs : rules.slabsByAge[age];
  const slabTaxAmt = slabTax(income, slabs);
  const basicExemption = regime === "new" ? rules.basicExemption : rules.basicExemptionByAge[age];
  let rebate = 0;
  if (income <= rules.rebateLimit) rebate = Math.min(slabTaxAmt, rules.rebateMax);
  else {
    const above = income - rules.rebateLimit;
    if (above < slabTaxAmt) rebate = slabTaxAmt - above;
  }
  const afterRebate = Math.max(slabTaxAmt - rebate, 0);
  const surchRate = surchargeRate(income, rules.maxSurchargeRate);
  const surcharge = afterRebate * surchRate;
  const cess = (afterRebate + surcharge) * CESS_RATE;
  const grossTax = afterRebate + surcharge + cess;

  const netLiability = Math.max(grossTax - tds - tcs - relief, 0);

  const schedule = presumptive
    ? [{ label: "15 Mar (100%)", pct: 1.0, paid: paid.mar }]
    : [
        { label: "15 Jun (15%)", pct: 0.15, paid: paid.jun },
        { label: "15 Sep (45%)", pct: 0.45, paid: paid.sep },
        { label: "15 Dec (75%)", pct: 0.75, paid: paid.dec },
        { label: "15 Mar (100%)", pct: 1.0, paid: paid.mar },
      ];

  let rows = "";
  let cumulativePaid = 0;
  schedule.forEach(s => {
    cumulativePaid += s.paid;
    const required = netLiability * s.pct;
    const shortfall = Math.max(required - cumulativePaid, 0);
    rows += `<tr>
      <td>${s.label}</td>
      <td>${inr(required)}</td>
      <td>${inr(cumulativePaid)}</td>
      <td>${shortfall > 0 ? `<span class="test-fail">${inr(shortfall)}</span>` : `<span class="test-pass">Nil</span>`}</td>
    </tr>`;
  });

  document.getElementById("advResults").innerHTML = `
    <div class="note-box">
      Tax on Estimated Income: <strong>${inr(grossTax)}</strong> &nbsp;|&nbsp;
      Net Advance Tax Liability (after TDS/TCS/relief): <strong>${inr(netLiability)}</strong>
    </div>
    <table class="slab-table">
      <thead><tr><th>Instalment</th><th>Required (Cumulative)</th><th>Paid (Cumulative)</th><th>Shortfall</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
});

// ---------------------------------------------------------------------------
// Interest u/s 234B & 234C
// ---------------------------------------------------------------------------

document.getElementById("intComputeBtn").addEventListener("click", () => {
  const assessedTax = num("intAssessedTax");
  const advancePaid = num("intAdvancePaid");
  const months234B = num("intMonths234B");
  const presumptive = document.getElementById("intPresumptive").checked;
  const paid = { jun: num("intJun"), sep: num("intSep"), dec: num("intDec"), mar: num("intMar") };

  // Section 234B
  const ninetyPct = assessedTax * 0.90;
  const shortfall234B = advancePaid < ninetyPct ? Math.max(assessedTax - advancePaid, 0) : 0;
  const interest234B = shortfall234B * 0.01 * months234B;

  // Section 234C
  const schedule = presumptive
    ? [{ label: "15 Mar (100%)", pct: 1.0, paid: paid.mar, months: 1 }]
    : [
        { label: "15 Jun (15%)", pct: 0.15, paid: paid.jun, months: 3 },
        { label: "15 Sep (45%)", pct: 0.45, paid: paid.sep, months: 3 },
        { label: "15 Dec (75%)", pct: 0.75, paid: paid.dec, months: 3 },
        { label: "15 Mar (100%)", pct: 1.0, paid: paid.mar, months: 1 },
      ];

  let rows = "";
  let total234C = 0;
  schedule.forEach(s => {
    const required = assessedTax * s.pct;
    const shortfall = Math.max(required - s.paid, 0);
    const interest = shortfall * 0.01 * s.months;
    total234C += interest;
    rows += `<tr>
      <td>${s.label}</td>
      <td>${inr(required)}</td>
      <td>${inr(s.paid)}</td>
      <td>${inr(shortfall)}</td>
      <td>${inr(interest)}</td>
    </tr>`;
  });

  document.getElementById("intResults").innerHTML = `
    <div class="note-box">
      Section 234B Interest (${shortfall234B > 0 ? `shortfall ${inr(shortfall234B)} × 1% × ${months234B} months` : "advance tax ≥ 90% of assessed tax, no interest"}):
      <strong>${inr(interest234B)}</strong>
    </div>
    <table class="slab-table">
      <thead><tr><th>Instalment</th><th>Required (Cumulative)</th><th>Paid (Cumulative)</th><th>Shortfall</th><th>Interest</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="note-box">Total Section 234C Interest: <strong>${inr(total234C)}</strong> &nbsp;|&nbsp; Total 234B + 234C: <strong>${inr(interest234B + total234C)}</strong></div>
  `;
});

// ---------------------------------------------------------------------------
// Tax Slabs tab
// ---------------------------------------------------------------------------

function renderSlabsTab() {
  const fy = "2025-26";
  const newRules = CONFIG[fy].new;
  const oldRules = CONFIG[fy].old;

  let newRows = "";
  let prev = 0;
  newRules.slabs.forEach(s => {
    const label = s.upto === Infinity ? `Above ${inr(prev)}` : `${inr(prev + (prev ? 1 : 0))} - ${inr(s.upto)}`;
    newRows += `<tr><td>${label}</td><td>${s.rate === 0 ? "Nil" : (s.rate * 100).toFixed(0) + "%"}</td></tr>`;
    prev = s.upto;
  });

  let oldRows = "";
  prev = 0;
  oldRules.slabsByAge.below60.forEach(s => {
    const label = s.upto === Infinity ? `Above ${inr(prev)}` : `${inr(prev + (prev ? 1 : 0))} - ${inr(s.upto)}`;
    oldRows += `<tr><td>${label}</td><td>${s.rate === 0 ? "Nil" : (s.rate * 100).toFixed(0) + "%"}</td></tr>`;
    prev = s.upto;
  });

  let surchargeRows = "";
  SURCHARGE_BRACKETS.forEach((b, i) => {
    if (b.rate === 0) return;
    const lower = SURCHARGE_BRACKETS[i - 1].upto;
    const label = b.upto === Infinity ? `Above ${inr(lower)}` : `Above ${inr(lower)} - up to ${inr(b.upto)}`;
    const oldRate = (Math.min(b.rate, oldRules.maxSurchargeRate) * 100).toFixed(0) + "%";
    const newRate = (Math.min(b.rate, newRules.maxSurchargeRate) * 100).toFixed(0) + "%" + (b.rate > newRules.maxSurchargeRate ? " (capped)" : "");
    surchargeRows += `<tr><td>${label}</td><td>${oldRate}</td><td>${newRate}</td></tr>`;
  });

  document.getElementById("slabsContent").innerHTML = `
    <div class="slabs-block">
      <h3>New Tax Regime — u/s 115BAC <span class="head-tag new">Default</span></h3>
      <p class="section-note">Applicable to FY 2025-26 (AY 2026-27) and FY 2026-27 — same slab structure carried forward.</p>
      <table class="slab-table"><thead><tr><th>Total Income (₹)</th><th>Rate of Tax</th></tr></thead><tbody>${newRows}</tbody></table>
      <div class="note-box">Rebate u/s 87A: Available where total income does not exceed ₹12,00,000 (maximum rebate ₹60,000), with marginal relief just above the threshold, so till an income of ₹12,00,000 no tax is payable. Standard deduction: ₹75,000 for salaried/pensioners. Rebate is not available on special-rate capital gains.</div>
    </div>
    <div class="slabs-block">
      <h3>Old Tax Regime <span class="head-tag old">Optional</span></h3>
      <p class="section-note">Individual below 60 / Non-resident / HUF / AOP / BOI / AJP — FY 2025-26 and FY 2026-27.</p>
      <table class="slab-table"><thead><tr><th>Total Income (₹)</th><th>Rate of Tax</th></tr></thead><tbody>${oldRows}</tbody></table>
      <div class="note-box">Basic exemption limit varies by age: Resident Senior Citizens (60–79 years) — first ₹3,00,000 nil; Resident Super Senior Citizens (80 years and above) — first ₹5,00,000 nil. Remaining slabs unchanged. Rebate u/s 87A: up to total income of ₹5,00,000 (maximum ₹12,500). Standard deduction: ₹50,000 for salaried/pensioners. Non-residents are not eligible for rebate u/s 87A.</div>
    </div>
    <div class="slabs-block">
      <h3>Surcharge &amp; Health and Education Cess <span class="head-tag">Both Regimes</span></h3>
      <table class="slab-table"><thead><tr><th>Total Income (₹)</th><th>Surcharge — Old Regime</th><th>Surcharge — New Regime</th></tr></thead><tbody>${surchargeRows}</tbody></table>
      <div class="note-box">Surcharge on income taxable u/s 111A, 112, 112A and on dividend income is restricted to a maximum of 15%. Marginal relief on surcharge is available at each threshold. Health &amp; Education Cess @ 4% applies on tax + surcharge in all cases.</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Tax Table tab — quick-reference computation across income levels
// ---------------------------------------------------------------------------

function computeSimpleTax(income, regime, fy) {
  const rules = CONFIG[fy][regime];
  const slabs = regime === "new" ? rules.slabs : rules.slabsByAge.below60;
  const stdDed = rules.standardDeduction;
  const taxableIncome = Math.max(income - stdDed, 0);
  const slabTaxAmt = slabTax(taxableIncome, slabs);
  let rebate = 0;
  if (taxableIncome <= rules.rebateLimit) rebate = Math.min(slabTaxAmt, rules.rebateMax);
  else {
    const above = taxableIncome - rules.rebateLimit;
    if (above < slabTaxAmt) rebate = slabTaxAmt - above;
  }
  const afterRebate = Math.max(slabTaxAmt - rebate, 0);
  const surchRate = surchargeRate(taxableIncome, rules.maxSurchargeRate);
  const surcharge = afterRebate * surchRate;
  const cess = (afterRebate + surcharge) * CESS_RATE;
  return afterRebate + surcharge + cess;
}

function renderTableTab() {
  const fy = document.getElementById("tableFY").value;
  const incomes = [500000, 750000, 1000000, 1250000, 1500000, 2000000, 2500000, 3000000, 5000000, 10000000];
  let rows = "";
  incomes.forEach(inc => {
    const oldTax = computeSimpleTax(inc, "old", fy);
    const newTax = computeSimpleTax(inc, "new", fy);
    const better = newTax <= oldTax ? "New" : "Old";
    rows += `<tr><td>${inr(inc)}</td><td>${inr(oldTax)}</td><td>${inr(newTax)}</td><td>${inr(Math.abs(oldTax - newTax))}</td><td><strong>${better}</strong></td></tr>`;
  });
  document.getElementById("tableContent").innerHTML = `
    <table class="slab-table">
      <thead><tr><th>Gross Salary Income (₹)</th><th>Old Regime Tax</th><th>New Regime Tax</th><th>Difference</th><th>Better Option</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

document.getElementById("tableFY").addEventListener("change", renderTableTab);

// ---------------------------------------------------------------------------
// Validation Tests tab
// ---------------------------------------------------------------------------

function blankInputs() {
  const blank = {};
  Object.keys(SAMPLE_DATA).forEach(k => blank[k] = 0);
  blank.coOwnerShare = 100;
  blank.metroCity = "metro";
  blank.taxpayerType = "salaried";
  return blank;
}

function runValidationTests() {
  const tests = [
    {
      name: "₹15L salary, ₹1.5L 80C — New Regime tax",
      run: () => {
        const i = blankInputs(); i.grossSalary = 1500000;
        return computeRegime("new", "2025-26", "below60", i).totalTax;
      },
      expected: 97500,
    },
    {
      name: "₹15L salary, ₹1.5L 80C — Old Regime tax",
      run: () => {
        const i = blankInputs(); i.grossSalary = 1500000; i.sec80C = 150000;
        return computeRegime("old", "2025-26", "below60", i).totalTax;
      },
      expected: 210600,
    },
    {
      name: "₹2L salary + ₹4L LTCG(112A) — basic exemption absorbs gain (New)",
      run: () => {
        const i = blankInputs(); i.grossSalary = 200000; i.ltcg112A = 400000;
        return computeRegime("new", "2025-26", "below60", i).totalTax;
      },
      expected: 0,
    },
    {
      name: "₹10L salary + ₹3L business loss + ₹2L STCG(111A) — loss absorbs STCG, salary untouched (New)",
      run: () => {
        const i = blankInputs(); i.grossSalary = 1000000; i.netProfit = -300000; i.stcg111A = 200000;
        const r = computeRegime("new", "2025-26", "below60", i);
        return r.normalTaxableIncome;
      },
      expected: 925000,
    },
    {
      name: "₹13L income, New Regime — within ₹12L rebate marginal-relief zone",
      run: () => {
        const i = blankInputs(); i.grossSalary = 1275000; // taxable = 1200000 after std ded
        return computeRegime("new", "2025-26", "below60", i).totalTax;
      },
      expected: 0,
    },
  ];

  let html = "";
  tests.forEach(t => {
    const actual = Math.round(t.run());
    const pass = actual === t.expected;
    html += `<div class="test-row">
      <span>${t.name}</span>
      <span>${pass ? `<span class="test-pass">PASS</span>` : `<span class="test-fail">FAIL — expected ${inr(t.expected)}, got ${inr(actual)}</span>`}</span>
    </div>`;
  });
  document.getElementById("testResults").innerHTML = html;
}

document.getElementById("runTestsBtn").addEventListener("click", runValidationTests);

// ---------------------------------------------------------------------------
// Scenario Builder
//
// Self-contained module: it only reads the calculator's current input/
// control values and feeds them through the existing computeRegime()
// engine — no tax-calculation logic is duplicated here. State lives in
// localStorage so scenarios persist across page reloads.
// ---------------------------------------------------------------------------

const SCENARIO_STORAGE_KEY = "taxCalcScenarios_v1";
const MAX_SCENARIOS = 4;

function getScenarios() {
  try {
    const raw = localStorage.getItem(SCENARIO_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function setScenarios(scenarios) {
  localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(scenarios));
}

function newScenarioId() {
  return "sc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Captures a complete, reusable snapshot of the calculator's current state:
// every input field, the FY/age/regime/city controls, and both regimes'
// computed results (so the comparison table never has to recompute or
// guess — it just reads the snapshot).
function captureScenarioSnapshot(name) {
  const fy = document.getElementById("fy").value;
  const age = document.getElementById("age").value;
  const regimeToggle = document.getElementById("regimeToggle").value;
  const inputs = readInputs();
  return {
    id: newScenarioId(),
    name,
    createdAt: Date.now(),
    fy,
    age,
    regimeToggle,
    inputs,
    oldResult: computeRegime("old", fy, age, inputs),
    newResult: computeRegime("new", fy, age, inputs),
  };
}

// Picks which regime's result represents "the" outcome for a scenario:
// whichever the user had selected at save time, or the cheaper of the two
// if they had "Compare Both" selected.
function effectiveResultFor(scenario) {
  if (scenario.regimeToggle === "old") return { regime: "old", result: scenario.oldResult };
  if (scenario.regimeToggle === "new") return { regime: "new", result: scenario.newResult };
  return scenario.newResult.totalTax <= scenario.oldResult.totalTax
    ? { regime: "new", result: scenario.newResult }
    : { regime: "old", result: scenario.oldResult };
}

function deriveIncomeType(inputs) {
  const parts = [];
  if (inputs.grossSalary || inputs.basicDA || inputs.hraReceived || inputs.perquisites || inputs.daTerms) parts.push("Salary");
  if (inputs.presumptive44ADA > 0) parts.push("Professional");
  if (inputs.netProfit || inputs.presumptive44AD || inputs.presumptive44AE) parts.push("Business");
  if (inputs.letOutRent || inputs.selfOccupiedInterest) parts.push("House Property");
  if (inputs.stcgSlab || inputs.stcg111A || inputs.ltcg112A || inputs.ltcg112) parts.push("Capital Gains");
  if (inputs.savingsInterest || inputs.fdInterest || inputs.dividendIncome || inputs.familyPension
    || inputs.otherIncomeSlab || inputs.lottery115BB || inputs.onlineGaming115BBJ
    || inputs.vda115BBH || inputs.unexplained115BBE) parts.push("Other Sources");
  return parts.length ? parts.join(" + ") : "No Income Entered";
}

// Derives every metric the comparison table/cards need from a scenario's
// stored snapshot. Pure read of already-computed results — no recomputation
// of tax, so future engine changes only apply to newly-saved scenarios
// (old snapshots stay an accurate record of what was true when saved).
function computeScenarioMetrics(scenario) {
  const { regime, result: r } = effectiveResultFor(scenario);
  const inputs = scenario.inputs;

  const grossIncome = r.gti + r.specialIncome;
  const capitalGains = inputs.stcgSlab + inputs.stcg111A + inputs.ltcg112A + inputs.ltcg112;
  const otherIncome = inputs.savingsInterest + inputs.fdInterest + inputs.dividendIncome + inputs.familyPension
    + inputs.otherIncomeSlab + inputs.lottery115BB + inputs.onlineGaming115BBJ
    + inputs.vda115BBH + inputs.unexplained115BBE;
  const professionalIncome = inputs.presumptive44ADA;
  const businessIncome = r.businessIncome - professionalIncome;
  const effectiveRate = grossIncome > 0 ? (r.totalTax / grossIncome) * 100 : 0;
  const netIncomeAfterTax = grossIncome - r.totalTax;

  return {
    regime,
    grossIncome,
    salaryIncome: r.salaryTaxable,
    professionalIncome,
    businessIncome,
    houseProperty: r.houseProperty,
    capitalGains,
    otherIncome,
    totalDeductions: r.deductions,
    taxableIncome: r.totalTaxableIncome,
    incomeTax: r.taxBeforeRelief,
    surcharge: r.surcharge,
    cess: r.cess,
    totalTax: r.totalTax,
    effectiveRate,
    netIncomeAfterTax,
  };
}

function loadScenarioIntoCalculator(scenario) {
  Object.entries(scenario.inputs).forEach(([key, val]) => {
    const el = document.getElementById(key);
    if (!el) return;
    if (el.classList.contains("money-input")) setMoneyInputValue(el, val);
    else el.value = val;
  });
  document.getElementById("fy").value = scenario.fy;
  document.getElementById("age").value = scenario.age;
  document.getElementById("regimeToggle").value = scenario.regimeToggle;

  document.querySelector('.tab-btn[data-tab="calculator"]').click();
  render();
}

function toggleScenarioDetail(scenario) {
  const el = document.getElementById("detail-" + scenario.id);
  if (!el) return;
  if (!el.classList.contains("hidden")) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  const { regime, result: r } = effectiveResultFor(scenario);
  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="row"><span>Financial Year</span><span>${scenario.fy}</span></div>
    <div class="row"><span>Regime used</span><span>${regime === "new" ? "New Regime" : "Old Regime"}</span></div>
    <div class="row"><span>Gross Total Income</span><span>${inr(r.gti + r.specialIncome)}</span></div>
    <div class="row"><span>Deductions</span><span>${inr(r.deductions)}</span></div>
    <div class="row"><span>Taxable Income</span><span>${inr(r.totalTaxableIncome)}</span></div>
    <div class="row"><span>Tax before Surcharge/Cess</span><span>${inr(r.taxBeforeRelief)}</span></div>
    <div class="row"><span>Surcharge</span><span>${inr(r.surcharge)}</span></div>
    <div class="row"><span>Health &amp; Education Cess</span><span>${inr(r.cess)}</span></div>
    <div class="row total-row"><span>Total Tax Payable</span><span>${inr(r.totalTax)}</span></div>
  `;
}

function handleScenarioAction(action, id) {
  const scenarios = getScenarios();
  const idx = scenarios.findIndex(s => s.id === id);
  if (idx === -1) return;
  const scenario = scenarios[idx];

  if (action === "delete") {
    if (confirm(`Delete scenario "${scenario.name}"? This cannot be undone.`)) {
      scenarios.splice(idx, 1);
      setScenarios(scenarios);
      renderScenarioBuilder();
    }
  } else if (action === "rename") {
    const newName = prompt("Rename scenario:", scenario.name);
    if (newName && newName.trim()) {
      scenario.name = newName.trim();
      setScenarios(scenarios);
      renderScenarioBuilder();
    }
  } else if (action === "duplicate") {
    if (scenarios.length >= MAX_SCENARIOS) {
      alert(`You already have ${MAX_SCENARIOS} saved scenarios — the maximum allowed. Please delete an existing scenario before duplicating.`);
      return;
    }
    const copy = JSON.parse(JSON.stringify(scenario));
    copy.id = newScenarioId();
    copy.name = scenario.name + " (Copy)";
    copy.createdAt = Date.now();
    scenarios.push(copy);
    setScenarios(scenarios);
    renderScenarioBuilder();
  } else if (action === "load" || action === "edit") {
    loadScenarioIntoCalculator(scenario);
  } else if (action === "view") {
    toggleScenarioDetail(scenario);
  }
}

function buildComparisonTableHtml(scenarios, metricsById, bestTaxId, bestNetId, bestRateId) {
  const metricRows = [
    ["Income Type", s => escapeHtml(deriveIncomeType(s.inputs))],
    ["Regime Used", s => metricsById[s.id].regime === "new" ? "New" : "Old"],
    ["Gross Income", s => inr(metricsById[s.id].grossIncome)],
    ["Salary Income", s => inr(metricsById[s.id].salaryIncome)],
    ["Professional Income", s => inr(metricsById[s.id].professionalIncome)],
    ["Business Income", s => inr(metricsById[s.id].businessIncome)],
    ["House Property Income", s => inr(metricsById[s.id].houseProperty)],
    ["Capital Gains", s => inr(metricsById[s.id].capitalGains)],
    ["Other Income", s => inr(metricsById[s.id].otherIncome)],
    ["Total Deductions", s => inr(metricsById[s.id].totalDeductions)],
    ["Taxable Income", s => inr(metricsById[s.id].taxableIncome)],
    ["Income Tax", s => inr(metricsById[s.id].incomeTax)],
    ["Surcharge", s => inr(metricsById[s.id].surcharge)],
    ["Health & Education Cess", s => inr(metricsById[s.id].cess)],
  ];

  const headerCells = scenarios.map(s => `<th>${escapeHtml(s.name)}</th>`).join("");
  const bodyRows = metricRows.map(([label, fn]) => {
    const cells = scenarios.map(s => `<td>${fn(s)}</td>`).join("");
    return `<tr><td>${label}</td>${cells}</tr>`;
  }).join("");

  const taxRow = `<tr class="metric-row"><td><strong>Total Tax Payable</strong></td>${
    scenarios.map(s => `<td class="${s.id === bestTaxId ? "winner-cell" : ""}">${inr(metricsById[s.id].totalTax)}</td>`).join("")
  }</tr>`;
  const rateRow = `<tr class="metric-row"><td><strong>Effective Tax Rate</strong></td>${
    scenarios.map(s => `<td class="${s.id === bestRateId ? "winner-cell" : ""}">${metricsById[s.id].effectiveRate.toFixed(2)}%</td>`).join("")
  }</tr>`;
  const netRow = `<tr class="metric-row"><td><strong>Net Income After Tax</strong></td>${
    scenarios.map(s => `<td class="${s.id === bestNetId ? "winner-cell" : ""}">${inr(metricsById[s.id].netIncomeAfterTax)}</td>`).join("")
  }</tr>`;

  return `
    <div class="compare-table-wrap">
      <table class="compare-table">
        <thead><tr><th>Metric</th>${headerCells}</tr></thead>
        <tbody>${bodyRows}${taxRow}${rateRow}${netRow}</tbody>
      </table>
    </div>
  `;
}

function renderScenarioBuilder() {
  const scenarios = getScenarios();
  const cardsEl = document.getElementById("scenarioCards");
  const compareEl = document.getElementById("scenarioComparison");
  if (!cardsEl || !compareEl) return;

  if (scenarios.length === 0) {
    cardsEl.innerHTML = `<div class="scenario-card-empty">No scenarios saved yet. Go to the Tax Calculator tab, fill in an income structure, click Calculate Tax, then "+ Add to Scenario".</div>`;
    compareEl.innerHTML = "";
    return;
  }

  const metricsById = {};
  scenarios.forEach(s => { metricsById[s.id] = computeScenarioMetrics(s); });

  let bestTaxId = scenarios[0].id, bestNetId = scenarios[0].id, bestRateId = scenarios[0].id;
  scenarios.forEach(s => {
    const m = metricsById[s.id];
    if (m.totalTax < metricsById[bestTaxId].totalTax) bestTaxId = s.id;
    if (m.netIncomeAfterTax > metricsById[bestNetId].netIncomeAfterTax) bestNetId = s.id;
    if (m.effectiveRate < metricsById[bestRateId].effectiveRate) bestRateId = s.id;
  });

  cardsEl.innerHTML = scenarios.map(s => {
    const m = metricsById[s.id];
    const badges = [];
    if (s.id === bestTaxId) badges.push('<span class="scenario-badge best-tax">Lowest Tax</span>');
    if (s.id === bestNetId) badges.push('<span class="scenario-badge best-net">Highest Net Income</span>');
    if (s.id === bestRateId) badges.push('<span class="scenario-badge best-rate">Lowest Effective Rate</span>');
    return `
      <div class="scenario-card" data-id="${s.id}">
        <div>${badges.join("")}</div>
        <div class="scenario-card-name">${escapeHtml(s.name)}</div>
        <div class="scenario-card-type">${escapeHtml(deriveIncomeType(s.inputs))} — ${m.regime === "new" ? "New Regime" : "Old Regime"}</div>
        <div class="scenario-card-tax">${inr(m.totalTax)}</div>
        <div class="scenario-card-rate">Effective rate: ${m.effectiveRate.toFixed(2)}% &nbsp;|&nbsp; Net income: ${inr(m.netIncomeAfterTax)}</div>
        <div class="scenario-card-actions">
          <button data-action="view" data-id="${s.id}">View</button>
          <button data-action="load" data-id="${s.id}">Load</button>
          <button data-action="edit" data-id="${s.id}">Edit</button>
          <button data-action="duplicate" data-id="${s.id}">Duplicate</button>
          <button data-action="rename" data-id="${s.id}">Rename</button>
          <button data-action="delete" data-id="${s.id}" class="danger">Delete</button>
        </div>
        <div class="scenario-card-detail hidden" id="detail-${s.id}"></div>
      </div>
    `;
  }).join("") + (scenarios.length >= MAX_SCENARIOS
    ? `<div class="scenario-card-empty">Maximum of ${MAX_SCENARIOS} scenarios reached. Delete one to add another.</div>`
    : "");

  cardsEl.querySelectorAll("button[data-action]").forEach(btn => {
    btn.addEventListener("click", () => handleScenarioAction(btn.dataset.action, btn.dataset.id));
  });

  compareEl.innerHTML = buildComparisonTableHtml(scenarios, metricsById, bestTaxId, bestNetId, bestRateId);
}

document.getElementById("addToScenarioBtn").addEventListener("click", () => {
  const scenarios = getScenarios();
  if (scenarios.length >= MAX_SCENARIOS) {
    alert(`You already have ${MAX_SCENARIOS} saved scenarios — the maximum allowed. Please delete an existing scenario from the Scenario Builder tab before adding another.`);
    return;
  }
  render(); // ensure the snapshot reflects the latest inputs on screen
  const defaultName = "Scenario " + (scenarios.length + 1);
  const name = prompt("Name this scenario:", defaultName);
  if (name === null) return; // cancelled
  const snapshot = captureScenarioSnapshot(name.trim() || defaultName);
  scenarios.push(snapshot);
  setScenarios(scenarios);
  renderScenarioBuilder();
  alert(`Scenario "${snapshot.name}" saved. View it in the Scenario Builder tab.`);
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.querySelectorAll(".money-input").forEach(attachMoneyFormatting);
document.querySelectorAll(".money-input").forEach(el => setMoneyInputValue(el, el.value));

render();
renderSlabsTab();
renderTableTab();
renderScenarioBuilder();
