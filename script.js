const $ = (id) => document.getElementById(id);

const form = $("emiForm");
const loanType = $("loanType");
const amountInput = $("loanAmount");
const rateInput = $("interestRate");
const tenureInput = $("loanTenure");
const amountRange = $("amountRange");
const rateRange = $("rateRange");
const tenureRange = $("tenureRange");
const errorMessage = $("errorMessage");
const resetBtn = $("resetBtn");
const downloadBtn = $("downloadBtn");
const scheduleBody = $("scheduleBody");
const scheduleSearch = $("scheduleSearch");
const showMoreBtn = $("showMoreBtn");

const presets = {
  personal: { amount: 500000, rate: 10, years: 5 },
  home: { amount: 3000000, rate: 8.5, years: 20 },
  car: { amount: 800000, rate: 9, years: 5 },
  education: { amount: 1000000, rate: 8, years: 7 }
};

let latest = null;
let schedule = [];
let showAll = false;
let chart = null;

const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2
}).format(Number.isFinite(value) ? value : 0);

const compactMoney = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0
}).format(Number.isFinite(value) ? value : 0);

function emiFor(principal, annualRate, months) {
  const r = annualRate / 1200;
  if (r === 0) return principal / months;
  const factor = Math.pow(1 + r, months);
  return principal * r * factor / (factor - 1);
}

function clearError() {
  errorMessage.textContent = "";
}

function resetOutput() {
  ["monthlyEmi", "principal", "totalInterest", "totalPayment", "principalLegend", "interestLegend"].forEach(id => $(id).textContent = money(0));
  $("totalMonths").textContent = "0 months";
  $("chartTotal").textContent = compactMoney(0);
  $("compareCurrent").textContent = money(0);
  $("compareLower").textContent = "—";
  $("compareHigher").textContent = "—";
  scheduleBody.innerHTML = '<tr><td colspan="6" class="empty-state">Your monthly repayment schedule will appear here.</td></tr>';
  $("scheduleCount").textContent = "Calculate an EMI to view your schedule.";
  showMoreBtn.classList.add("hidden");
  if (chart) chart.destroy();
  chart = null;
  latest = null;
  schedule = [];
}

function updateChart(principal, interest) {
  if (chart) chart.destroy();
  const ctx = $("loanChart").getContext("2d");
  chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Principal", "Interest"],
      datasets: [{
        data: [Math.max(0, principal), Math.max(0, interest)],
        backgroundColor: [ '#084a19','#5a5a5aff'],
        borderWidth: 0,
        hoverOffset: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "76%",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (context) => `${context.label}: ${money(context.raw)}` } }
      },
      animation: { duration: 650 }
    }
  });
}

function buildSchedule(principal, annualRate, months, emi) {
  const monthlyRate = annualRate / 1200;
  let balance = principal;
  const rows = [];
  for (let i = 1; i <= months; i++) {
    const opening = balance;
    let interest = opening * monthlyRate;
    let principalPaid = Math.min(opening, emi - interest);
    let payment = principalPaid + interest;
    balance = Math.max(0, opening - principalPaid);
    if (i === months || balance < 0.005) {
      principalPaid = opening;
      payment = principalPaid + interest;
      balance = 0;
    }
    rows.push({ month: i, opening, payment, principalPaid, interest, closing: balance });
    if (balance === 0) break;
  }
  return rows;
}

function renderSchedule() {
  if (!schedule.length) return;
  const query = scheduleSearch.value.trim().toLowerCase();
  const filtered = schedule.filter(row => String(row.month).includes(query));
  const visible = showAll ? filtered : filtered.slice(0, 12);
  if (!visible.length) {
    scheduleBody.innerHTML = '<tr><td colspan="6" class="empty-state">No months match your search.</td></tr>';
  } else {
    scheduleBody.innerHTML = visible.map(row => `
      <tr>
        <td>${row.month}</td>
        <td>${money(row.opening)}</td>
        <td>${money(row.payment)}</td>
        <td>${money(row.principalPaid)}</td>
        <td>${money(row.interest)}</td>
        <td>${money(row.closing)}</td>
      </tr>`).join("");
  }
  $("scheduleCount").textContent = query
    ? `${filtered.length} matching month${filtered.length === 1 ? "" : "s"}`
    : `${schedule.length} monthly payment${schedule.length === 1 ? "" : "s"} in your schedule`;
  showMoreBtn.classList.toggle("hidden", filtered.length <= 12);
  showMoreBtn.textContent = showAll ? "Show first 12 months" : `Show all ${filtered.length} months`;
}

function calculate(event) {
  if (event) event.preventDefault();
  clearError();

  const principal = Number(amountInput.value);
  const annualRate = Number(rateInput.value);
  const years = Number(tenureInput.value);
  if ([amountInput, rateInput, tenureInput].some(input => input.value.trim() === "")) {
    errorMessage.textContent = "Please enter the loan amount, interest rate, and tenure.";
    return;
  }
  if (!Number.isFinite(principal) || principal <= 0 || principal > 1e12) {
    errorMessage.textContent = "Enter a loan amount greater than ₹0 and no more than ₹1,00,00,00,00,000.";
    return;
  }
  if (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 100) {
    errorMessage.textContent = "Annual interest rate must be between 0% and 100%.";
    return;
  }
  if (!Number.isFinite(years) || years <= 0 || years > 100) {
    errorMessage.textContent = "Loan tenure must be greater than 0 and no more than 100 years.";
    return;
  }
  const months = Math.round(years * 12);
  if (!Number.isSafeInteger(months) || months < 1 || months > 1200) {
    errorMessage.textContent = "Please enter a tenure that converts to between 1 and 1,200 monthly payments.";
    return;
  }

  const emi = emiFor(principal, annualRate, months);
  if (!Number.isFinite(emi)) {
    errorMessage.textContent = "These values are too large to calculate. Please try smaller values.";
    return;
  }
  const rows = buildSchedule(principal, annualRate, months, emi);
  const totalInterest = rows.reduce((sum, row) => sum + row.interest, 0);
  const totalPayment = principal + totalInterest;

  latest = { principal, annualRate, years, months, emi, totalInterest, totalPayment, type: loanType.options[loanType.selectedIndex].text };
  schedule = rows;
  showAll = false;
  scheduleSearch.value = "";

  $("monthlyEmi").textContent = money(emi);
  $("principal").textContent = money(principal);
  $("totalInterest").textContent = money(totalInterest);
  $("totalPayment").textContent = money(totalPayment);
  $("totalMonths").textContent = `${months} months`;
  $("chartTotal").textContent = compactMoney(totalPayment);
  $("principalLegend").textContent = money(principal);
  $("interestLegend").textContent = money(totalInterest);

  $("compareCurrent").textContent = money(emi);
  $("compareLower").textContent = money(emiFor(principal, Math.max(0, annualRate - 1), months));
  $("compareHigher").textContent = money(emiFor(principal, Math.min(100, annualRate + 1), months));

  updateChart(principal, totalInterest);
  renderSchedule();
}

function syncRangeToInput(range, input, min, max) {
  const value = Number(input.value);
  if (input.value.trim() !== "" && Number.isFinite(value) && value >= min && value <= max) range.value = value;
}
function syncInputToRange(input, range) {
  input.value = range.value;
  if (latest) calculate();
}

amountRange.addEventListener("input", () => syncInputToRange(amountInput, amountRange));
rateRange.addEventListener("input", () => syncInputToRange(rateInput, rateRange));
tenureRange.addEventListener("input", () => syncInputToRange(tenureInput, tenureRange));
amountInput.addEventListener("input", () => syncRangeToInput(amountRange, amountInput, 10000, 10000000));
rateInput.addEventListener("input", () => syncRangeToInput(rateRange, rateInput, 0, 30));
tenureInput.addEventListener("input", () => syncRangeToInput(tenureRange, tenureInput, 1, 30));

loanType.addEventListener("change", () => {
  const preset = presets[loanType.value];
  amountInput.value = preset.amount;
  rateInput.value = preset.rate;
  tenureInput.value = preset.years;
  syncRangeToInput(amountRange, amountInput, 10000, 10000000);
  syncRangeToInput(rateRange, rateInput, 0, 30);
  syncRangeToInput(tenureRange, tenureInput, 1, 30);
  calculate();
});

form.addEventListener("submit", calculate);
scheduleSearch.addEventListener("input", () => { showAll = false; renderSchedule(); });
showMoreBtn.addEventListener("click", () => { showAll = !showAll; renderSchedule(); });

resetBtn.addEventListener("click", () => {
  form.reset();
  amountInput.value = "";
  rateInput.value = "";
  tenureInput.value = "";
  amountRange.value = "500000";
  rateRange.value = "10";
  tenureRange.value = "5";
  clearError();
  resetOutput();
});

downloadBtn.addEventListener("click", () => {
  if (!latest) {
    errorMessage.textContent = "Calculate an EMI before downloading your PDF summary.";
    return;
  }
  if (!window.jspdf || !window.jspdf.jsPDF) {
    errorMessage.textContent = "PDF library did not load. Check your internet connection and try again.";
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(36, 87, 230);
  doc.text("EMI Pro - Loan Summary", 18, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(70, 80, 100);
  doc.text(`Loan type: ${latest.type}`, 18, 34);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, 18, 41);
  doc.setDrawColor(220, 228, 240);
  doc.line(18, 47, 192, 47);
  const items = [
    ["Loan amount", money(latest.principal)],
    ["Annual interest rate", `${latest.annualRate}%`],
    ["Loan tenure", `${latest.years} years (${latest.months} months)`],
    ["Monthly EMI", money(latest.emi)],
    ["Total interest payable", money(latest.totalInterest)],
    ["Total repayment", money(latest.totalPayment)]
  ];
  let y = 60;
  items.forEach(([label, value], index) => {
    doc.setFont("helvetica", index === 3 ? "bold" : "normal");
    doc.setTextColor(35, 48, 70);
    doc.text(label, 18, y);
    doc.text(value, 192, y, { align: "right" });
    y += 12;
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 120, 140);
  doc.text("Estimate only. Actual lender rates, fees, and repayment terms may differ.", 18, 145);
  doc.save("emi-pro-loan-summary.pdf");
});

$("backTop").addEventListener("click", (event) => {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Sensible starter values; calculate only after the user presses the button.
amountInput.value = presets.personal.amount;
rateInput.value = presets.personal.rate;
tenureInput.value = presets.personal.years;
