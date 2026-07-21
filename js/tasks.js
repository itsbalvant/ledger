import { watchCollection, addItem, updateItem, deleteItem } from "./db.js";

const PRIORITY_ORDER = { high: 0, med: 1, low: 2 };

export function initTasks({ root, uid, showToast }) {
  const list = root.querySelector("#task-list");
  const input = root.querySelector("#task-input");
  const prioritySelect = root.querySelector("#task-priority");
  const dueInput = root.querySelector("#task-due");
  const addBtn = root.querySelector("#task-add-btn");
  const filterRow = root.querySelector("#task-filters");
  const emptyState = root.querySelector("#task-empty");

  let tasks = [];
  let filter = "active"; // active | done | all
  let dragId = null;

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function render() {
    let visible = tasks;
    if (filter === "active") visible = tasks.filter((t) => !t.done);
    if (filter === "done") visible = tasks.filter((t) => t.done);

    visible = [...visible].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const pa = PRIORITY_ORDER[a.priority] ?? 1;
      const pb = PRIORITY_ORDER[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return (a.order ?? 0) - (b.order ?? 0);
    });

    list.innerHTML = "";
    emptyState.classList.toggle("hidden", visible.length > 0);

    for (const t of visible) {
      const li = document.createElement("li");
      li.className = "task-item" + (t.done ? " done" : "");
      li.draggable = true;
      li.dataset.id = t.id;

      const isOverdue = t.dueDate && !t.done && t.dueDate < todayStr();

      li.innerHTML = `
        <button class="task-check" aria-label="Toggle done">
          <svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3 3 7-7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <span class="priority-dot ${t.priority || "med"}"></span>
        <span class="task-text"></span>
        ${t.dueDate ? `<span class="due-chip${isOverdue ? " overdue" : ""}">${formatDate(t.dueDate)}</span>` : ""}
        <button class="icon-x" aria-label="Delete">
          <svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      `;
      li.querySelector(".task-text").textContent = t.text;

      li.querySelector(".task-check").addEventListener("click", () =>
        updateItem(uid, "tasks", t.id, { done: !t.done }).catch((e) => showToast(e.message))
      );
      li.querySelector(".icon-x").addEventListener("click", () =>
        deleteItem(uid, "tasks", t.id).catch((e) => showToast(e.message))
      );

      li.addEventListener("dragstart", () => {
        dragId = t.id;
        li.classList.add("dragging");
      });
      li.addEventListener("dragend", () => li.classList.remove("dragging"));
      li.addEventListener("dragover", (e) => e.preventDefault());
      li.addEventListener("drop", (e) => {
        e.preventDefault();
        if (!dragId || dragId === t.id) return;
        reorder(dragId, t.id);
      });

      list.appendChild(li);
    }
  }

  async function reorder(sourceId, targetId) {
    const ids = tasks.filter((t) => !t.done).map((t) => t.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    await Promise.all(ids.map((id, i) => updateItem(uid, "tasks", id, { order: i })));
  }

  function formatDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  async function addTask() {
    const text = input.value.trim();
    if (!text) return;
    addBtn.disabled = true;
    try {
      await addItem(uid, "tasks", {
        text,
        done: false,
        priority: prioritySelect.value,
        dueDate: dueInput.value || null,
        order: tasks.length,
      });
      input.value = "";
      dueInput.value = "";
      input.focus();
    } catch (e) {
      showToast(e.message);
    } finally {
      addBtn.disabled = false;
    }
  }

  addBtn.addEventListener("click", addTask);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTask();
  });

  filterRow.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      filter = chip.dataset.filter;
      filterRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
      render();
    });
  });

  const unsub = watchCollection(uid, "tasks", "order", (items, err) => {
    if (err) { showToast("Sync error: " + err.message); return; }
    tasks = items;
    render();
  }, "asc");

  return { destroy: unsub };
}
