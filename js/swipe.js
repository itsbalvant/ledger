// iOS-style swipe-to-delete for list rows, via Pointer Events (works with
// touch, mouse, and pen). Wraps an already-built row element so callers
// don't need to touch their own render logic beyond appending the result
// instead of the bare row.
//
// Usage:
//   const row = document.createElement("div"); // or "li" content
//   ...build row...
//   list.appendChild(attachSwipeToDelete(row, () => doDelete(), { wrapTag: "li" }));

const REVEAL_WIDTH = 84; // px width of the exposed delete action
const OPEN_FRACTION = 0.55; // release past this fraction of REVEAL_WIDTH -> snap open
const AUTO_DELETE_PX = 150; // release past this -> delete immediately, no snap

let openWrap = null;

function closeSwipe(wrap, animate = true) {
  const content = wrap.querySelector(".swipe-content");
  content.style.transition = animate ? "transform .2s var(--ease)" : "none";
  content.style.transform = "translateX(0)";
  content.dataset.dx = "0";
  wrap.classList.remove("swipe-open");
  if (openWrap === wrap) openWrap = null;
}

// Close whatever's open when the user interacts elsewhere on the page.
document.addEventListener(
  "pointerdown",
  (e) => {
    if (openWrap && !openWrap.contains(e.target)) closeSwipe(openWrap);
  },
  true
);

export function attachSwipeToDelete(contentEl, onDelete, { wrapTag = "div" } = {}) {
  const wrap = document.createElement(wrapTag);
  wrap.className = "swipe-wrap";

  const actions = document.createElement("div");
  actions.className = "swipe-actions";
  const delBtn = document.createElement("button");
  delBtn.className = "swipe-delete-btn";
  delBtn.setAttribute("aria-label", "Delete");
  delBtn.innerHTML =
    '<svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  actions.appendChild(delBtn);
  delBtn.addEventListener("click", () => {
    closeSwipe(wrap, false);
    onDelete();
  });

  contentEl.classList.add("swipe-content");
  contentEl.style.touchAction = "pan-y";
  wrap.appendChild(actions);
  wrap.appendChild(contentEl);

  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let dragging = false;
  let axis = null; // null while undecided, then "x" or "y"

  function onDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (openWrap && openWrap !== wrap) closeSwipe(openWrap);
    startX = e.clientX;
    startY = e.clientY;
    baseX = wrap.classList.contains("swipe-open") ? -REVEAL_WIDTH : 0;
    dragging = true;
    axis = null;
    contentEl.style.transition = "none";
  }

  function onMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (axis === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (axis !== "x") return;
    e.preventDefault();
    let next = baseX + dx;
    if (next > 0) next = next * 0.3; // resistance dragging right past closed
    else if (next < -REVEAL_WIDTH) next = -REVEAL_WIDTH + (next + REVEAL_WIDTH) * 0.3; // resistance past full reveal
    contentEl.style.transform = `translateX(${next}px)`;
    contentEl.dataset.dx = String(next);
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    if (axis !== "x") {
      axis = null;
      return;
    }
    axis = null;
    const next = parseFloat(contentEl.dataset.dx || "0");
    contentEl.style.transition = "transform .2s var(--ease)";
    if (next <= -AUTO_DELETE_PX) {
      // Same handler as tapping the delete button — some callers gate this
      // behind confirm(). Snap back first (not animate-away-then-delete):
      // if the user cancels a confirm dialog, the row must not have already
      // looked deleted. If they confirm, the list's own re-render removes
      // this element for real; the snap-back is a harmless no-op by then.
      closeSwipe(wrap, false);
      onDelete();
      return;
    }
    if (next <= -REVEAL_WIDTH * OPEN_FRACTION) {
      contentEl.style.transform = `translateX(-${REVEAL_WIDTH}px)`;
      contentEl.dataset.dx = String(-REVEAL_WIDTH);
      wrap.classList.add("swipe-open");
      openWrap = wrap;
    } else {
      closeSwipe(wrap);
    }
  }

  contentEl.addEventListener("pointerdown", onDown);
  contentEl.addEventListener("pointermove", onMove);
  contentEl.addEventListener("pointerup", onUp);
  contentEl.addEventListener("pointercancel", onUp);

  return wrap;
}
