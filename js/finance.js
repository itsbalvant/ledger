import { watchCollection, addItem, updateItem, deleteItem, setItem } from "./db.js";
import { localDateStr, localMonthStr } from "./date-utils.js";
import { attachSwipeToDelete } from "./swipe.js";

// Assumes INR — change this one constant if you'd rather see a different symbol.
const CURRENCY = "₹";
const LOCALE = "en-IN";

const CATEGORIES = ["Food", "Transport", "Shopping", "Bills", "Health", "Entertainment", "Other"];
const CATEGORY_COLORS = {
  Food: "#b5502f",
  Transport: "#3b6ea5",
  Shopping: "#b8863a",
  Bills: "#b23b3b",
  Health: "#4c7a52",
  Entertainment: "#8a5fb0",
  Other: "#8b877c",
};
const INVESTMENT_TYPES = ["FD", "Bonds", "Stocks", "Savings", "Other"];
const INVESTMENT_TYPE_COLORS = {
  FD: "#3b82f6",
  Bonds: "#8b5cf6",
  Stocks: "#ec4899",
  Savings: "#1e9e4f",
  Other: "#8b877c",
};

function money(n) {
  const v = Number(n) || 0;
  return CURRENCY + Math.round(v).toLocaleString(LOCALE);
}

function escapeAttr(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/* ---------------- Period navigation helpers ---------------- */
function periodKey(mode, dateStr) {
  if (!dateStr) return null;
  if (mode === "day") return dateStr;
  if (mode === "month") return dateStr.slice(0, 7);
  if (mode === "year") return dateStr.slice(0, 4);
  return "all";
}
function shiftAnchor(mode, anchor, dir) {
  const d = new Date(anchor + "T00:00:00");
  if (mode === "day") {
    d.setDate(d.getDate() + dir);
  } else if (mode === "month") {
    // Pin to day 1 before shifting — otherwise e.g. Mar 31 minus one month
    // overflows into March 2/3 instead of landing in February.
    d.setDate(1);
    d.setMonth(d.getMonth() + dir);
  } else if (mode === "year") {
    d.setDate(1);
    d.setFullYear(d.getFullYear() + dir);
  }
  return localDateStr(d);
}
function periodLabel(mode, anchor) {
  const d = new Date(anchor + "T00:00:00");
  if (mode === "day") return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  if (mode === "month") return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
  if (mode === "year") return String(d.getFullYear());
  return "All time";
}

export function initFinance({ root, uid, showToast }) {
  const tabsRow = root.querySelector("#finance-tabs");
  const panes = {
    overview: root.querySelector("#finance-overview"),
    expenses: root.querySelector("#finance-expenses"),
    investments: root.querySelector("#finance-investments"),
    lending: root.querySelector("#finance-lending"),
  };

  const statCards = root.querySelector("#finance-stat-cards");
  const categoryBars = root.querySelector("#finance-category-bars");
  const categoryEmpty = root.querySelector("#finance-category-empty");
  const chartTooltip = document.getElementById("chart-tooltip");
  const spendingTrendEl = root.querySelector("#spending-trend");
  const spendingTrendEmpty = root.querySelector("#spending-trend-empty");
  const networthSvg = root.querySelector("#networth-svg");
  const networthTrendEmpty = root.querySelector("#networth-trend-empty");

  const expAmount = root.querySelector("#expense-amount");
  const expCategory = root.querySelector("#expense-category");
  const expDate = root.querySelector("#expense-date");
  const expNote = root.querySelector("#expense-note");
  const expAddBtn = root.querySelector("#expense-add-btn");
  const expenseList = root.querySelector("#expense-list");
  const expenseEmpty = root.querySelector("#expense-empty");

  const periodModeToggle = root.querySelector("#period-mode-toggle");
  const periodPrevBtn = root.querySelector("#period-prev");
  const periodNextBtn = root.querySelector("#period-next");
  const periodLabelEl = root.querySelector("#period-label");
  const periodTotalRow = root.querySelector("#period-total-row");

  const invType = root.querySelector("#investment-type");
  const invName = root.querySelector("#investment-name");
  const invAmount = root.querySelector("#investment-amount");
  const invAddBtn = root.querySelector("#investment-add-btn");
  const investmentGroups = root.querySelector("#investment-groups");
  const investmentEmpty = root.querySelector("#investment-empty");

  const loanDirection = root.querySelector("#loan-direction");
  const loanPerson = root.querySelector("#loan-person");
  const loanAmount = root.querySelector("#loan-amount");
  const loanDate = root.querySelector("#loan-date");
  const loanDueDate = root.querySelector("#loan-due-date");
  const loanRate = root.querySelector("#loan-rate");
  const loanNote = root.querySelector("#loan-note");
  const loanAddBtn = root.querySelector("#loan-add-btn");
  const loanFilterRow = root.querySelector("#loan-filters");
  const loanListEl = root.querySelector("#loan-list");
  const loanEmpty = root.querySelector("#loan-empty");

  let expenses = [];
  let investments = [];
  let netWorthHistory = [];
  let loans = [];
  let loanPayments = [];
  let editingExpenseId = null;
  let editingInvestmentId = null;
  let editingLoanId = null;
  let loggingPaymentForLoanId = null;
  let loanFilter = "active"; // active | settled | all
  let periodMode = "month"; // day | month | year | all
  let periodAnchor = localDateStr();

  loanDate.value = localDateStr();

  /* ---------------- Shared chart tooltip ---------------- */
  function showChartTooltip(el, valueText, labelText) {
    const rect = el.getBoundingClientRect();
    chartTooltip.innerHTML = "";
    const v = document.createElement("div");
    v.className = "tip-value";
    v.textContent = valueText;
    const l = document.createElement("div");
    l.className = "tip-label";
    l.textContent = labelText;
    chartTooltip.appendChild(v);
    chartTooltip.appendChild(l);
    chartTooltip.style.left = rect.left + rect.width / 2 + "px";
    chartTooltip.style.top = rect.top + "px";
    chartTooltip.classList.remove("hidden");
  }
  function hideChartTooltip() {
    chartTooltip.classList.add("hidden");
  }

  /* ---------------- Spending trend (bar chart, last 12 months) ---------------- */
  function lastNMonths(n) {
    const out = [];
    const first = new Date();
    first.setDate(1);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(first.getFullYear(), first.getMonth() - i, 1);
      out.push(localMonthStr(d));
    }
    return out;
  }

  function renderSpendingTrend() {
    const months = lastNMonths(12);
    const totals = months.map((m) =>
      expenses.filter((e) => (e.date || "").startsWith(m)).reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    );
    const hasAny = totals.some((t) => t > 0);
    spendingTrendEmpty.classList.toggle("hidden", hasAny);
    spendingTrendEl.classList.toggle("hidden", !hasAny);
    if (!hasAny) return;

    const max = Math.max(...totals);
    const currentMonthKey = localMonthStr();
    spendingTrendEl.innerHTML = "";
    months.forEach((m, i) => {
      const total = totals[i];
      const pct = max ? (total / max) * 100 : 0;
      const isCurrent = m === currentMonthKey;
      const col = document.createElement("div");
      col.className = "trend-bar-col" + (isCurrent ? " is-current" : "");
      col.tabIndex = 0;
      const shortLabel = new Date(m + "-01T00:00:00").toLocaleDateString(undefined, { month: "short" });
      col.innerHTML = `
        ${isCurrent ? `<div class="trend-bar-tip-value"></div>` : ""}
        <div class="trend-bar" style="height:${pct}%"></div>
        <div class="trend-bar-label"></div>
      `;
      if (isCurrent) col.querySelector(".trend-bar-tip-value").textContent = money(total);
      col.querySelector(".trend-bar-label").textContent = shortLabel;

      const fullLabel = new Date(m + "-01T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });
      col.addEventListener("pointerenter", () => showChartTooltip(col, money(total), fullLabel));
      col.addEventListener("pointerleave", hideChartTooltip);
      col.addEventListener("focus", () => showChartTooltip(col, money(total), fullLabel));
      col.addEventListener("blur", hideChartTooltip);
      spendingTrendEl.appendChild(col);
    });
  }

  /* ---------------- Net worth trend (line chart) ---------------- */
  function renderNetWorthTrend() {
    const points = netWorthHistory;
    networthTrendEmpty.classList.toggle("hidden", points.length > 0);
    networthSvg.classList.toggle("hidden", points.length === 0);
    networthSvg.innerHTML = "";
    if (!points.length) return;

    const W = 600, H = 160, PAD = 24;
    const values = points.map((p) => Number(p.total) || 0);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const range = max - min || 1;
    const xFor = (i) => (points.length === 1 ? W / 2 : PAD + (i / (points.length - 1)) * (W - PAD * 2));
    const yFor = (v) => H - PAD - ((v - min) / range) * (H - PAD * 2);

    const NS = "http://www.w3.org/2000/svg";
    const baseline = document.createElementNS(NS, "line");
    baseline.setAttribute("class", "trend-axis");
    baseline.setAttribute("x1", "0");
    baseline.setAttribute("x2", String(W));
    baseline.setAttribute("y1", String(H - PAD));
    baseline.setAttribute("y2", String(H - PAD));
    networthSvg.appendChild(baseline);

    if (points.length > 1) {
      let d = "";
      points.forEach((_, i) => {
        d += (i === 0 ? "M" : "L") + xFor(i) + " " + yFor(values[i]) + " ";
      });
      const area = document.createElementNS(NS, "path");
      area.setAttribute("class", "trend-area");
      area.setAttribute("d", d.trim() + ` L${xFor(points.length - 1)} ${H - PAD} L${xFor(0)} ${H - PAD} Z`);
      networthSvg.appendChild(area);

      const path = document.createElementNS(NS, "path");
      path.setAttribute("class", "trend-line-path");
      path.setAttribute("d", d.trim());
      networthSvg.appendChild(path);
    }

    points.forEach((p, i) => {
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("class", "trend-dot");
      dot.setAttribute("cx", String(xFor(i)));
      dot.setAttribute("cy", String(yFor(values[i])));
      dot.setAttribute("r", "5");
      dot.setAttribute("tabindex", "0");
      const dateLabel = new Date(p.id + "T00:00:00").toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      dot.addEventListener("pointerenter", () => showChartTooltip(dot, money(values[i]), dateLabel));
      dot.addEventListener("pointerleave", hideChartTooltip);
      dot.addEventListener("focus", () => showChartTooltip(dot, money(values[i]), dateLabel));
      dot.addEventListener("blur", hideChartTooltip);
      networthSvg.appendChild(dot);
    });
  }

  expDate.value = localDateStr();

  /* ---------------- Tab switching ---------------- */
  tabsRow.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      tabsRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
      Object.entries(panes).forEach(([name, el]) => el.classList.toggle("hidden", name !== chip.dataset.tab));
    });
  });

  /* ---------------- Overview ---------------- */
  function renderOverview() {
    const investTotal = investments.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const { receivable, payable, net: lendingNet } = lendingTotals();
    const netWorth = investTotal + lendingNet;

    const now = new Date();
    const monthKey = localMonthStr(now);
    const thisMonthExpenses = expenses.filter((e) => (e.date || "").startsWith(monthKey));
    const monthTotal = thisMonthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const last30Total = expenses
      .filter((e) => e.date && new Date(e.date + "T00:00:00").getTime() >= last30)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    statCards.innerHTML = `
      <div class="stat-card hero">
        <div class="label">Net worth</div>
        <div class="value">${money(netWorth)}</div>
        <div class="sub">${investments.length} holding${investments.length === 1 ? "" : "s"} + lending</div>
      </div>
      <div class="stat-card">
        <div class="label">Lending balance</div>
        <div class="value${lendingNet < 0 ? " negative" : ""}">${money(lendingNet)}</div>
        <div class="sub">Owed to you ${money(receivable)} · You owe ${money(payable)}</div>
      </div>
      <div class="stat-card">
        <div class="label">Spent this month</div>
        <div class="value negative">${money(monthTotal)}</div>
        <div class="sub">${thisMonthExpenses.length} transaction${thisMonthExpenses.length === 1 ? "" : "s"}</div>
      </div>
      <div class="stat-card">
        <div class="label">Last 30 days</div>
        <div class="value">${money(last30Total)}</div>
        <div class="sub">Across all categories</div>
      </div>
    `;

    const byCategory = {};
    for (const e of thisMonthExpenses) {
      const cat = e.category || "Other";
      byCategory[cat] = (byCategory[cat] || 0) + (Number(e.amount) || 0);
    }
    const rows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 0;

    categoryEmpty.classList.toggle("hidden", rows.length > 0);
    categoryBars.innerHTML = rows
      .map(
        ([cat, amt]) => `
        <div class="category-bar-row">
          <div class="category-bar-label">${cat}</div>
          <div class="category-bar-track">
            <div class="category-bar-fill" style="width:${max ? (amt / max) * 100 : 0}%;background:${CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other}"></div>
          </div>
          <div class="category-bar-amount">${money(amt)}</div>
        </div>
      `
      )
      .join("");
  }

  /* ---------------- Expenses ---------------- */
  periodModeToggle.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      periodMode = b.dataset.mode;
      periodModeToggle.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      renderExpenses();
    });
  });
  periodPrevBtn.addEventListener("click", () => {
    periodAnchor = shiftAnchor(periodMode, periodAnchor, -1);
    renderExpenses();
  });
  periodNextBtn.addEventListener("click", () => {
    periodAnchor = shiftAnchor(periodMode, periodAnchor, 1);
    renderExpenses();
  });

  function buildExpenseEditRow(e) {
    const li = document.createElement("li");
    li.className = "expense-row-edit";
    li.innerHTML = `
      <input type="number" inputmode="decimal" step="0.01" class="edit-amount" value="${e.amount}">
      <select class="edit-category">
        ${CATEGORIES.map((c) => `<option${c === e.category ? " selected" : ""}>${c}</option>`).join("")}
      </select>
      <input type="date" class="edit-date" value="${e.date || ""}">
      <input type="text" class="edit-note" placeholder="Note" value="${escapeAttr(e.note)}">
      <button class="icon-save" aria-label="Save"><svg viewBox="0 0 20 20"><use href="#icon-check"/></svg></button>
      <button class="icon-x" aria-label="Cancel"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke-width="2" stroke-linecap="round"/></svg></button>
    `;
    li.querySelector(".icon-save").addEventListener("click", async () => {
      const amount = parseFloat(li.querySelector(".edit-amount").value);
      if (!amount || amount <= 0) {
        showToast("Enter a valid amount");
        return;
      }
      try {
        await updateItem(uid, "expenses", e.id, {
          amount,
          category: li.querySelector(".edit-category").value,
          date: li.querySelector(".edit-date").value || e.date,
          note: li.querySelector(".edit-note").value.trim(),
        });
        editingExpenseId = null;
        renderExpenses();
      } catch (err) {
        showToast(err.message);
      }
    });
    li.querySelector(".icon-x").addEventListener("click", () => {
      editingExpenseId = null;
      renderExpenses();
    });
    return li;
  }

  function renderExpenses() {
    const isAll = periodMode === "all";
    periodPrevBtn.disabled = isAll;
    periodNextBtn.disabled = isAll;
    periodLabelEl.textContent = isAll ? "All time" : periodLabel(periodMode, periodAnchor);

    const filtered = isAll
      ? expenses
      : expenses.filter((e) => periodKey(periodMode, e.date) === periodKey(periodMode, periodAnchor));
    const sorted = [...filtered].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const periodTotal = filtered.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    periodTotalRow.textContent = sorted.length
      ? `${money(periodTotal)} across ${sorted.length} transaction${sorted.length === 1 ? "" : "s"}`
      : "";

    expenseEmpty.classList.toggle("hidden", sorted.length > 0);
    expenseList.innerHTML = "";
    sorted.forEach((e, i) => {
      if (e.id === editingExpenseId) {
        expenseList.appendChild(buildExpenseEditRow(e));
        return;
      }
      const content = document.createElement("div");
      content.className = "expense-row anim-in";
      content.style.setProperty("--stagger", Math.min(i, 8) * 12 + "ms");
      const category = e.category || "Other";
      content.innerHTML = `
        <span class="icon-badge" style="background:${CATEGORY_COLORS[category] || CATEGORY_COLORS.Other}"></span>
        <div class="info">
          <div class="cat"></div>
          ${e.note ? `<div class="note"></div>` : ""}
        </div>
        <span class="date-chip"></span>
        <span class="amount"></span>
        <button class="icon-edit" aria-label="Edit">
          <svg viewBox="0 0 20 20"><use href="#icon-edit"/></svg>
        </button>
        <button class="icon-x" aria-label="Delete">
          <svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      `;
      content.querySelector(".icon-badge").textContent = category[0];
      content.querySelector(".cat").textContent = category;
      if (e.note) content.querySelector(".note").textContent = e.note;
      content.querySelector(".date-chip").textContent = formatDate(e.date);
      content.querySelector(".amount").textContent = money(e.amount);
      content.querySelector(".icon-edit").addEventListener("click", () => {
        editingExpenseId = e.id;
        renderExpenses();
      });
      const deleteExpense = () => {
        if (!confirm("Delete this expense?")) return;
        deleteItem(uid, "expenses", e.id).catch((err) => showToast(err.message));
      };
      content.querySelector(".icon-x").addEventListener("click", deleteExpense);
      expenseList.appendChild(attachSwipeToDelete(content, deleteExpense, { wrapTag: "li" }));
    });
  }

  function formatDate(iso) {
    if (!iso) return "";
    return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  async function addExpense() {
    const amount = parseFloat(expAmount.value);
    if (!amount || amount <= 0) {
      showToast("Enter a valid amount");
      return;
    }
    expAddBtn.disabled = true;
    try {
      await addItem(uid, "expenses", {
        amount,
        category: expCategory.value,
        date: expDate.value || localDateStr(),
        note: expNote.value.trim(),
      });
      expAmount.value = "";
      expNote.value = "";
      expAmount.focus();
    } catch (err) {
      showToast(err.message);
    } finally {
      expAddBtn.disabled = false;
    }
  }
  expAddBtn.addEventListener("click", addExpense);
  [expAmount, expNote].forEach((el) =>
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addExpense();
    })
  );

  /* ---------------- Investments ---------------- */
  function buildInvestmentEditRow(inv, type) {
    const row = document.createElement("div");
    row.className = "investment-row-edit";
    row.innerHTML = `
      <select class="edit-type">
        ${INVESTMENT_TYPES.map((t) => `<option${t === inv.type ? " selected" : ""}>${t}</option>`).join("")}
      </select>
      <input type="text" class="edit-name" placeholder="Name" value="${escapeAttr(inv.name)}">
      <input type="number" inputmode="decimal" step="0.01" class="edit-amount" value="${inv.amount}">
      <button class="icon-save" aria-label="Save"><svg viewBox="0 0 20 20"><use href="#icon-check"/></svg></button>
      <button class="icon-x" aria-label="Cancel"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke-width="2" stroke-linecap="round"/></svg></button>
    `;
    row.querySelector(".icon-save").addEventListener("click", async () => {
      const amount = parseFloat(row.querySelector(".edit-amount").value);
      if (!amount || amount <= 0) {
        showToast("Enter a valid amount");
        return;
      }
      try {
        await updateItem(uid, "investments", inv.id, {
          type: row.querySelector(".edit-type").value,
          name: row.querySelector(".edit-name").value.trim(),
          amount,
        });
        editingInvestmentId = null;
        renderInvestments();
      } catch (err) {
        showToast(err.message);
      }
    });
    row.querySelector(".icon-x").addEventListener("click", () => {
      editingInvestmentId = null;
      renderInvestments();
    });
    return row;
  }

  function renderInvestments() {
    investmentEmpty.classList.toggle("hidden", investments.length > 0);
    investmentGroups.innerHTML = "";

    for (const type of INVESTMENT_TYPES) {
      const items = investments.filter((i) => i.type === type);
      if (!items.length) continue;
      const total = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

      const group = document.createElement("div");
      group.className = "investment-group";
      group.innerHTML = `
        <div class="investment-group-header">
          <span class="type-name"></span>
          <span class="type-total"></span>
        </div>
        <div class="investment-list"></div>
      `;
      group.querySelector(".type-name").textContent = type;
      group.querySelector(".type-total").textContent = money(total);
      const list = group.querySelector(".investment-list");

      items.forEach((inv, idx) => {
        if (inv.id === editingInvestmentId) {
          list.appendChild(buildInvestmentEditRow(inv, type));
          return;
        }
        const row = document.createElement("div");
        row.className = "investment-row anim-in";
        row.style.setProperty("--stagger", Math.min(idx, 8) * 12 + "ms");
        row.innerHTML = `
          <span class="icon-badge" style="background:${INVESTMENT_TYPE_COLORS[type] || INVESTMENT_TYPE_COLORS.Other}"></span>
          <div class="info">
            <div class="type-label"></div>
          </div>
          <span class="amount"></span>
          <button class="icon-edit" aria-label="Edit">
            <svg viewBox="0 0 20 20"><use href="#icon-edit"/></svg>
          </button>
          <button class="icon-x" aria-label="Delete">
            <svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        `;
        row.querySelector(".icon-badge").textContent = type[0];
        row.querySelector(".type-label").textContent = inv.name || type;
        row.querySelector(".amount").textContent = money(inv.amount);
        row.querySelector(".icon-edit").addEventListener("click", () => {
          editingInvestmentId = inv.id;
          renderInvestments();
        });
        const deleteInvestment = () => {
          if (!confirm(`Delete "${inv.name || type}"?`)) return;
          deleteItem(uid, "investments", inv.id).catch((err) => showToast(err.message));
        };
        row.querySelector(".icon-x").addEventListener("click", deleteInvestment);
        list.appendChild(attachSwipeToDelete(row, deleteInvestment));
      });
      investmentGroups.appendChild(group);
    }
  }

  async function addInvestment() {
    const amount = parseFloat(invAmount.value);
    if (!amount || amount <= 0) {
      showToast("Enter a valid amount");
      return;
    }
    invAddBtn.disabled = true;
    try {
      await addItem(uid, "investments", {
        type: invType.value,
        name: invName.value.trim(),
        amount,
      });
      invName.value = "";
      invAmount.value = "";
      invName.focus();
    } catch (err) {
      showToast(err.message);
    } finally {
      invAddBtn.disabled = false;
    }
  }
  invAddBtn.addEventListener("click", addInvestment);
  [invName, invAmount].forEach((el) =>
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addInvestment();
    })
  );

  /* ---------------- Lending / borrowing ---------------- */
  function loanPaymentsFor(loanId) {
    return loanPayments.filter((p) => p.loanId === loanId).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }
  function accruedInterest(loan, asOfStr) {
    if (!loan.interestRate) return 0;
    const start = new Date(loan.date + "T00:00:00");
    const end = new Date(asOfStr + "T00:00:00");
    const days = Math.max(0, (end - start) / 86400000);
    return (Number(loan.principal) || 0) * (Number(loan.interestRate) / 100) * (days / 365);
  }
  function loanPaidTotal(loanId) {
    return loanPaymentsFor(loanId).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }
  function loanOutstanding(loan) {
    const interest = accruedInterest(loan, localDateStr());
    const paid = loanPaidTotal(loan.id);
    return Math.max(0, (Number(loan.principal) || 0) + interest - paid);
  }
  function lendingTotals() {
    let receivable = 0;
    let payable = 0;
    for (const loan of loans) {
      if (loan.settled) continue;
      const outstanding = loanOutstanding(loan);
      if (loan.direction === "lent") receivable += outstanding;
      else payable += outstanding;
    }
    return { receivable, payable, net: receivable - payable };
  }
  function formatLoanDate(iso) {
    if (!iso) return "";
    return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  loanFilterRow.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      loanFilter = chip.dataset.filter;
      loanFilterRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
      renderLoans();
    });
  });

  function buildLoanEditForm(loan) {
    const wrap = document.createElement("div");
    wrap.className = "expense-row-edit";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "stretch";
    wrap.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <select class="edit-direction">
          <option value="lent">I lent</option>
          <option value="borrowed">I borrowed</option>
        </select>
        <input type="text" class="edit-person" placeholder="Person" value="${escapeAttr(loan.person)}">
        <input type="number" inputmode="decimal" step="0.01" class="edit-principal" value="${loan.principal}">
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        <input type="date" class="edit-date" value="${loan.date || ""}">
        <input type="date" class="edit-due-date" value="${loan.dueDate || ""}">
        <input type="number" inputmode="decimal" step="0.1" class="edit-rate" placeholder="Interest %/yr" value="${loan.interestRate ?? ""}">
        <input type="text" class="edit-note" placeholder="Note" value="${escapeAttr(loan.note)}" style="flex:1;min-width:100px;">
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn btn-primary save-btn" style="width:auto;padding:8px 16px;">Save</button>
        <button class="btn btn-ghost cancel-btn" style="width:auto;padding:8px 16px;">Cancel</button>
      </div>
    `;
    wrap.querySelector(".edit-direction").value = loan.direction;
    wrap.querySelector(".save-btn").addEventListener("click", async () => {
      const principal = parseFloat(wrap.querySelector(".edit-principal").value);
      if (!principal || principal <= 0) {
        showToast("Enter a valid amount");
        return;
      }
      try {
        await updateItem(uid, "loans", loan.id, {
          direction: wrap.querySelector(".edit-direction").value,
          person: wrap.querySelector(".edit-person").value.trim(),
          principal,
          date: wrap.querySelector(".edit-date").value || loan.date,
          dueDate: wrap.querySelector(".edit-due-date").value || null,
          interestRate: parseFloat(wrap.querySelector(".edit-rate").value) || null,
          note: wrap.querySelector(".edit-note").value.trim(),
        });
        editingLoanId = null;
        renderLoans();
      } catch (err) {
        showToast(err.message);
      }
    });
    wrap.querySelector(".cancel-btn").addEventListener("click", () => {
      editingLoanId = null;
      renderLoans();
    });
    return wrap;
  }

  function buildPaymentLogForm(loan) {
    const wrap = document.createElement("div");
    wrap.className = "loan-payment-form";
    wrap.innerHTML = `
      <input type="number" inputmode="decimal" step="0.01" class="pay-amount" placeholder="Amount">
      <input type="date" class="pay-date">
      <button class="icon-save" aria-label="Save payment"><svg viewBox="0 0 20 20"><use href="#icon-check"/></svg></button>
      <button class="icon-x" aria-label="Cancel"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke-width="2" stroke-linecap="round"/></svg></button>
    `;
    wrap.querySelector(".pay-date").value = localDateStr();
    wrap.querySelector(".icon-save").addEventListener("click", async () => {
      const amount = parseFloat(wrap.querySelector(".pay-amount").value);
      if (!amount || amount <= 0) {
        showToast("Enter a valid amount");
        return;
      }
      try {
        await addItem(uid, "loanPayments", {
          loanId: loan.id,
          amount,
          date: wrap.querySelector(".pay-date").value || localDateStr(),
        });
        loggingPaymentForLoanId = null;
        renderLoans();
      } catch (err) {
        showToast(err.message);
      }
    });
    wrap.querySelector(".icon-x").addEventListener("click", () => {
      loggingPaymentForLoanId = null;
      renderLoans();
    });
    return wrap;
  }

  async function deleteLoanWithPayments(loanId) {
    try {
      await Promise.all(loanPaymentsFor(loanId).map((p) => deleteItem(uid, "loanPayments", p.id)));
      await deleteItem(uid, "loans", loanId);
    } catch (err) {
      showToast(err.message);
    }
  }

  function buildLoanCard(loan, index) {
    const card = document.createElement("div");
    card.className = "loan-card anim-in" + (loan.settled ? " settled" : "");
    card.style.setProperty("--stagger", Math.min(index, 8) * 15 + "ms");

    if (loan.id === editingLoanId) {
      card.appendChild(buildLoanEditForm(loan));
      return card;
    }

    const interest = accruedInterest(loan, localDateStr());
    const paid = loanPaidTotal(loan.id);
    const outstanding = loanOutstanding(loan);
    const isReceivable = loan.direction === "lent";
    const denom = (Number(loan.principal) || 0) + interest;
    const pct = denom > 0 ? Math.min(100, (paid / denom) * 100) : 0;

    const top = document.createElement("div");
    top.className = "loan-top";
    top.innerHTML = `
      <span class="loan-direction-badge ${loan.direction}"></span>
      <span class="loan-person"></span>
      <button class="icon-edit" aria-label="Edit"><svg viewBox="0 0 20 20"><use href="#icon-edit"/></svg></button>
      <button class="icon-x" aria-label="Delete"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke-width="2" stroke-linecap="round"/></svg></button>
    `;
    top.querySelector(".loan-direction-badge").textContent = loan.direction === "lent" ? "Lent" : "Borrowed";
    top.querySelector(".loan-person").textContent = loan.person || "Unnamed";
    top.querySelector(".icon-edit").addEventListener("click", () => {
      editingLoanId = loan.id;
      renderLoans();
    });
    const deleteThisLoan = () => {
      if (!confirm(`Delete this loan with ${loan.person || "this person"}? Its payment history will be removed too.`)) return;
      deleteLoanWithPayments(loan.id);
    };
    top.querySelector(".icon-x").addEventListener("click", deleteThisLoan);
    card.appendChild(top);

    const amounts = document.createElement("div");
    amounts.className = "loan-amounts";
    function amountRow(label, valueText) {
      const span = document.createElement("span");
      span.append(label + " ", Object.assign(document.createElement("b"), { textContent: valueText }));
      amounts.appendChild(span);
    }
    amountRow("Principal:", money(loan.principal));
    if (loan.interestRate) amountRow(`Interest ${loan.interestRate}%/yr:`, money(interest));
    amountRow("Paid:", money(paid));
    card.appendChild(amounts);

    const outRow = document.createElement("div");
    outRow.className = "loan-outstanding-row";
    outRow.innerHTML = `
      <span class="loan-outstanding-label">Outstanding</span>
      <span class="loan-outstanding-value ${isReceivable ? "receivable" : "payable"}"></span>
    `;
    outRow.querySelector(".loan-outstanding-value").textContent = money(outstanding);
    card.appendChild(outRow);

    const track = document.createElement("div");
    track.className = "loan-progress-track";
    track.innerHTML = `<div class="loan-progress-fill" style="width:${pct}%"></div>`;
    card.appendChild(track);

    const meta = document.createElement("div");
    meta.className = "loan-meta";
    const sinceChip = document.createElement("span");
    sinceChip.textContent = "Since " + formatLoanDate(loan.date);
    meta.appendChild(sinceChip);
    if (loan.dueDate) {
      const overdue = !loan.settled && outstanding > 0 && loan.dueDate < localDateStr();
      const dueChip = document.createElement("span");
      dueChip.className = "due-chip" + (overdue ? " overdue" : "");
      dueChip.textContent = "Due " + formatLoanDate(loan.dueDate);
      meta.appendChild(dueChip);
    }
    if (loan.note) {
      const noteSpan = document.createElement("span");
      noteSpan.textContent = "· " + loan.note;
      meta.appendChild(noteSpan);
    }
    card.appendChild(meta);

    if (loan.settled) {
      const badge = document.createElement("span");
      badge.className = "settled-badge";
      badge.textContent = "Settled";
      card.appendChild(badge);
    } else {
      const actions = document.createElement("div");
      actions.className = "loan-actions";
      actions.innerHTML = `
        <button class="btn btn-ghost log-payment-btn">Log payment</button>
        <button class="btn btn-ghost settle-btn">Mark settled</button>
      `;
      actions.querySelector(".log-payment-btn").addEventListener("click", () => {
        loggingPaymentForLoanId = loggingPaymentForLoanId === loan.id ? null : loan.id;
        renderLoans();
      });
      actions.querySelector(".settle-btn").addEventListener("click", () => {
        updateItem(uid, "loans", loan.id, { settled: true }).catch((err) => showToast(err.message));
      });
      card.appendChild(actions);

      if (loggingPaymentForLoanId === loan.id) {
        card.appendChild(buildPaymentLogForm(loan));
      }
    }

    const payments = loanPaymentsFor(loan.id);
    if (payments.length) {
      const list = document.createElement("div");
      list.className = "loan-payments-list";
      payments.forEach((p) => {
        const row = document.createElement("div");
        row.className = "loan-payment-row";
        row.innerHTML = `
          <span class="amount"></span>
          <span class="date"></span>
          <button class="icon-x" aria-label="Delete payment"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke-width="2" stroke-linecap="round"/></svg></button>
        `;
        row.querySelector(".amount").textContent = money(p.amount);
        row.querySelector(".date").textContent = formatLoanDate(p.date);
        row.querySelector(".icon-x").addEventListener("click", () => {
          if (!confirm("Remove this payment record?")) return;
          deleteItem(uid, "loanPayments", p.id).catch((err) => showToast(err.message));
        });
        list.appendChild(row);
      });
      card.appendChild(list);
    }

    return attachSwipeToDelete(card, deleteThisLoan);
  }

  function renderLoans() {
    let visible = loans;
    if (loanFilter === "active") visible = loans.filter((l) => !l.settled);
    if (loanFilter === "settled") visible = loans.filter((l) => l.settled);

    loanEmpty.classList.toggle("hidden", visible.length > 0);
    loanListEl.innerHTML = "";
    visible.forEach((loan, i) => loanListEl.appendChild(buildLoanCard(loan, i)));
  }

  async function addLoan() {
    const amount = parseFloat(loanAmount.value);
    if (!amount || amount <= 0) {
      showToast("Enter a valid amount");
      return;
    }
    if (!loanPerson.value.trim()) {
      showToast("Enter who this loan is with");
      return;
    }
    loanAddBtn.disabled = true;
    try {
      await addItem(uid, "loans", {
        direction: loanDirection.value,
        person: loanPerson.value.trim(),
        principal: amount,
        date: loanDate.value || localDateStr(),
        dueDate: loanDueDate.value || null,
        interestRate: parseFloat(loanRate.value) || null,
        note: loanNote.value.trim(),
        settled: false,
      });
      loanPerson.value = "";
      loanAmount.value = "";
      loanDueDate.value = "";
      loanRate.value = "";
      loanNote.value = "";
      loanPerson.focus();
    } catch (err) {
      showToast(err.message);
    } finally {
      loanAddBtn.disabled = false;
    }
  }
  loanAddBtn.addEventListener("click", addLoan);
  [loanPerson, loanAmount, loanNote].forEach((el) =>
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addLoan();
    })
  );

  /* ---------------- Data subscriptions ---------------- */
  const unsubExpenses = watchCollection(uid, "expenses", "createdAt", (items, err) => {
    if (err) { showToast("Sync error: " + err.message); return; }
    expenses = items;
    renderOverview();
    renderExpenses();
    renderSpendingTrend();
  });
  // Net worth (investments + lending balance) has no history before today —
  // this starts a daily snapshot log going forward so the trend chart has
  // something to plot over time. Any of the three collections that feed
  // net worth can trigger it.
  function maybeSnapshotNetWorth() {
    if (investments.length === 0 && loans.length === 0) return;
    const investTotal = investments.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const netWorth = investTotal + lendingTotals().net;
    const today = localDateStr();
    setItem(uid, "netWorthHistory", today, { total: netWorth, date: today }).catch(() => {});
  }

  const unsubInvestments = watchCollection(uid, "investments", "createdAt", (items, err) => {
    if (err) { showToast("Sync error: " + err.message); return; }
    investments = items;
    renderOverview();
    renderInvestments();
    maybeSnapshotNetWorth();
  });
  const unsubNetWorthHistory = watchCollection(uid, "netWorthHistory", "date", (items, err) => {
    if (err) { showToast("Sync error: " + err.message); return; }
    netWorthHistory = items;
    renderNetWorthTrend();
  }, "asc");
  const unsubLoans = watchCollection(uid, "loans", "createdAt", (items, err) => {
    if (err) { showToast("Sync error: " + err.message); return; }
    loans = items;
    renderOverview();
    renderLoans();
    maybeSnapshotNetWorth();
  });
  const unsubLoanPayments = watchCollection(uid, "loanPayments", "createdAt", (items, err) => {
    if (err) { showToast("Sync error: " + err.message); return; }
    loanPayments = items;
    renderOverview();
    renderLoans();
    maybeSnapshotNetWorth();
  });

  return {
    destroy: () => {
      unsubExpenses();
      unsubInvestments();
      unsubNetWorthHistory();
      unsubLoans();
      unsubLoanPayments();
      hideChartTooltip();
    },
  };
}
