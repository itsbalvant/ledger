import { watchCollection, addItem, deleteItem } from "./db.js";

// Assumes INR — change this one constant if you'd rather see a different symbol.
const CURRENCY = "₹";
const LOCALE = "en-IN";

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

function money(n) {
  const v = Number(n) || 0;
  return CURRENCY + Math.round(v).toLocaleString(LOCALE);
}

export function initFinance({ root, uid, showToast }) {
  const tabsRow = root.querySelector("#finance-tabs");
  const panes = {
    overview: root.querySelector("#finance-overview"),
    expenses: root.querySelector("#finance-expenses"),
    investments: root.querySelector("#finance-investments"),
  };

  const statCards = root.querySelector("#finance-stat-cards");
  const categoryBars = root.querySelector("#finance-category-bars");
  const categoryEmpty = root.querySelector("#finance-category-empty");

  const expAmount = root.querySelector("#expense-amount");
  const expCategory = root.querySelector("#expense-category");
  const expDate = root.querySelector("#expense-date");
  const expNote = root.querySelector("#expense-note");
  const expAddBtn = root.querySelector("#expense-add-btn");
  const expenseList = root.querySelector("#expense-list");
  const expenseEmpty = root.querySelector("#expense-empty");

  const invType = root.querySelector("#investment-type");
  const invName = root.querySelector("#investment-name");
  const invAmount = root.querySelector("#investment-amount");
  const invAddBtn = root.querySelector("#investment-add-btn");
  const investmentGroups = root.querySelector("#investment-groups");
  const investmentEmpty = root.querySelector("#investment-empty");

  let expenses = [];
  let investments = [];

  expDate.value = new Date().toISOString().slice(0, 10);

  /* ---------------- Tab switching ---------------- */
  tabsRow.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      tabsRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
      Object.entries(panes).forEach(([name, el]) => el.classList.toggle("hidden", name !== chip.dataset.tab));
    });
  });

  /* ---------------- Overview ---------------- */
  function renderOverview() {
    const netWorth = investments.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

    const now = new Date();
    const monthKey = now.toISOString().slice(0, 7); // YYYY-MM
    const thisMonthExpenses = expenses.filter((e) => (e.date || "").startsWith(monthKey));
    const monthTotal = thisMonthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const last30Total = expenses
      .filter((e) => e.date && new Date(e.date + "T00:00:00").getTime() >= last30)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    statCards.innerHTML = `
      <div class="stat-card">
        <div class="label">Net worth</div>
        <div class="value">${money(netWorth)}</div>
        <div class="sub">${investments.length} holding${investments.length === 1 ? "" : "s"}</div>
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
  function renderExpenses() {
    const sorted = [...expenses].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    expenseEmpty.classList.toggle("hidden", sorted.length > 0);
    expenseList.innerHTML = "";
    for (const e of sorted) {
      const li = document.createElement("li");
      li.className = "expense-row";
      li.innerHTML = `
        <span class="cat-dot" style="background:${CATEGORY_COLORS[e.category] || CATEGORY_COLORS.Other}"></span>
        <div class="info">
          <div class="cat"></div>
          ${e.note ? `<div class="note"></div>` : ""}
        </div>
        <span class="date-chip"></span>
        <span class="amount"></span>
        <button class="icon-x" aria-label="Delete">
          <svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      `;
      li.querySelector(".cat").textContent = e.category || "Other";
      if (e.note) li.querySelector(".note").textContent = e.note;
      li.querySelector(".date-chip").textContent = formatDate(e.date);
      li.querySelector(".amount").textContent = money(e.amount);
      li.querySelector(".icon-x").addEventListener("click", () => {
        if (!confirm("Delete this expense?")) return;
        deleteItem(uid, "expenses", e.id).catch((err) => showToast(err.message));
      });
      expenseList.appendChild(li);
    }
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
        date: expDate.value || new Date().toISOString().slice(0, 10),
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

      for (const i of items) {
        const row = document.createElement("div");
        row.className = "investment-row";
        row.innerHTML = `
          <div class="info">
            <div class="type-label"></div>
          </div>
          <span class="amount"></span>
          <button class="icon-x" aria-label="Delete">
            <svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        `;
        row.querySelector(".type-label").textContent = i.name || type;
        row.querySelector(".amount").textContent = money(i.amount);
        row.querySelector(".icon-x").addEventListener("click", () => {
          if (!confirm(`Delete "${i.name || type}"?`)) return;
          deleteItem(uid, "investments", i.id).catch((err) => showToast(err.message));
        });
        list.appendChild(row);
      }
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

  /* ---------------- Data subscriptions ---------------- */
  const unsubExpenses = watchCollection(uid, "expenses", "createdAt", (items, err) => {
    if (err) { showToast("Sync error: " + err.message); return; }
    expenses = items;
    renderOverview();
    renderExpenses();
  });
  const unsubInvestments = watchCollection(uid, "investments", "createdAt", (items, err) => {
    if (err) { showToast("Sync error: " + err.message); return; }
    investments = items;
    renderOverview();
    renderInvestments();
  });

  return {
    destroy: () => {
      unsubExpenses();
      unsubInvestments();
    },
  };
}
