import { watchCollection, addItem, updateItem, deleteItem } from "./db.js";

export function initReading({ root, uid, showToast }) {
  const grid = root.querySelector("#article-grid");
  const urlInput = root.querySelector("#article-url");
  const titleInput = root.querySelector("#article-title");
  const tagsInput = root.querySelector("#article-tags");
  const addBtn = root.querySelector("#article-add-btn");
  const filterRow = root.querySelector("#article-filters");
  const emptyState = root.querySelector("#article-empty");

  let articles = [];
  let filter = "all"; // unread | read | all

  function domainOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function render() {
    let visible = articles;
    if (filter === "unread") visible = articles.filter((a) => !a.read);
    if (filter === "read") visible = articles.filter((a) => a.read);

    grid.innerHTML = "";
    emptyState.classList.toggle("hidden", visible.length > 0);

    for (const a of visible) {
      const card = document.createElement("div");
      card.className = "article-card" + (a.read ? " read" : "");
      const domain = domainOf(a.url);
      card.innerHTML = `
        <div class="article-top">
          <img class="article-fav" src="https://icons.duckduckgo.com/ip3/${domain}.ico" alt="" onerror="this.style.visibility='hidden'">
          <button class="icon-x" aria-label="Delete">
            <svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
        <a class="article-link" target="_blank" rel="noopener noreferrer"><h3></h3></a>
        <div class="article-domain"></div>
        <div class="article-tags"></div>
        <div class="article-actions">
          <button class="btn btn-ghost read-toggle">${a.read ? "Mark unread" : "Mark read"}</button>
        </div>
      `;
      const link = card.querySelector(".article-link");
      link.href = a.url;
      link.querySelector("h3").textContent = a.title || a.url;
      card.querySelector(".article-domain").textContent = domain;
      const tagsWrap = card.querySelector(".article-tags");
      (a.tags || []).forEach((t) => {
        const el = document.createElement("span");
        el.className = "tag";
        el.textContent = t;
        tagsWrap.appendChild(el);
      });
      card.querySelector(".read-toggle").addEventListener("click", () =>
        updateItem(uid, "articles", a.id, { read: !a.read }).catch((e) => showToast(e.message))
      );
      card.querySelector(".icon-x").addEventListener("click", () => {
        if (!confirm("Delete this article from your reading list?")) return;
        deleteItem(uid, "articles", a.id).catch((e) => showToast(e.message));
      });
      grid.appendChild(card);
    }
  }

  async function addArticle() {
    let url = urlInput.value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    addBtn.disabled = true;
    try {
      const tags = tagsInput.value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await addItem(uid, "articles", {
        url,
        title: titleInput.value.trim() || domainOf(url),
        tags,
        read: false,
      });
      urlInput.value = "";
      titleInput.value = "";
      tagsInput.value = "";
      urlInput.focus();
    } catch (e) {
      showToast(e.message);
    } finally {
      addBtn.disabled = false;
    }
  }

  addBtn.addEventListener("click", addArticle);
  [urlInput, titleInput, tagsInput].forEach((el) =>
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addArticle();
    })
  );

  filterRow.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      filter = chip.dataset.filter;
      filterRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
      render();
    });
  });

  const unsub = watchCollection(uid, "articles", "createdAt", (items, err) => {
    if (err) { showToast("Sync error: " + err.message); return; }
    articles = items;
    render();
  });

  return { destroy: unsub };
}
