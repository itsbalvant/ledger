import { watchCollection, addItem, updateItem, deleteItem } from "./db.js";
import { createDrawingEngine, renderStrokesToDataUrl } from "./canvas.js";

export function initNotes({ root, uid, showToast }) {
  const grid = root.querySelector("#notes-grid");
  const emptyState = root.querySelector("#notes-empty");

  const editor = document.querySelector("#note-editor");
  const editorTitle = editor.querySelector(".note-title");
  const closeBtn = editor.querySelector("#note-close-btn");
  const deleteBtn = editor.querySelector("#note-delete-btn");
  const textArea = editor.querySelector(".note-textarea");
  const canvasWrap = editor.querySelector(".canvas-wrap");
  const drawCanvas = editor.querySelector("#draw-canvas");
  const drawToolbar = editor.querySelector(".draw-toolbar");
  const colorSwatchesWrap = editor.querySelector(".color-swatches");
  const widthBtnsWrap = editor.querySelector(".width-btns");
  const undoBtn = editor.querySelector("#draw-undo");
  const clearBtn = editor.querySelector("#draw-clear");
  const eraserBtn = editor.querySelector("#draw-eraser");
  const penBtn = editor.querySelector("#draw-pen");

  let notes = [];
  let currentId = null;
  let currentType = null;
  let saveTimer = null;
  const engine = createDrawingEngine(drawCanvas);

  function buildToolbar() {
    colorSwatchesWrap.innerHTML = "";
    engine.COLORS.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "swatch" + (i === 0 ? " selected" : "");
      b.style.background = c;
      b.addEventListener("click", () => {
        engine.setColor(c);
        colorSwatchesWrap.querySelectorAll(".swatch").forEach((s) => s.classList.remove("selected"));
        b.classList.add("selected");
        setTool("pen");
      });
      colorSwatchesWrap.appendChild(b);
    });
    widthBtnsWrap.innerHTML = "";
    engine.WIDTHS.forEach((w, i) => {
      const b = document.createElement("button");
      b.className = "width-btn" + (i === 1 ? " selected" : "");
      const dot = document.createElement("span");
      dot.className = "dot";
      const size = 4 + i * 4;
      dot.style.width = size + "px";
      dot.style.height = size + "px";
      b.appendChild(dot);
      b.addEventListener("click", () => {
        engine.setWidthIdx(i);
        widthBtnsWrap.querySelectorAll(".width-btn").forEach((s) => s.classList.remove("selected"));
        b.classList.add("selected");
      });
      widthBtnsWrap.appendChild(b);
    });
  }
  buildToolbar();

  function setTool(t) {
    engine.setTool(t);
    penBtn.classList.toggle("selected", t === "pen");
    eraserBtn.classList.toggle("selected", t === "eraser");
  }
  penBtn.addEventListener("click", () => setTool("pen"));
  eraserBtn.addEventListener("click", () => setTool("eraser"));
  undoBtn.addEventListener("click", () => engine.undo());
  clearBtn.addEventListener("click", () => {
    if (confirm("Clear the whole drawing?")) engine.clear();
  });

  function scheduleSave(data) {
    const id = currentId;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      updateItem(uid, "notes", id, data).catch((e) => showToast(e.message));
    }, 500);
  }

  engine.onStrokesChange((strokes) => {
    if (currentId && currentType === "drawing") scheduleSave({ strokes });
  });

  textArea.addEventListener("input", () => {
    if (currentId && currentType === "text") scheduleSave({ content: textArea.value });
  });
  editorTitle.addEventListener("input", () => {
    if (currentId) scheduleSave({ title: editorTitle.value });
  });

  function openEditor(note) {
    currentId = note.id;
    currentType = note.type;
    editorTitle.value = note.title || "";
    editor.classList.remove("hidden");
    if (note.type === "drawing") {
      textArea.classList.add("hidden");
      canvasWrap.classList.remove("hidden");
      drawToolbar.classList.remove("hidden");
      requestAnimationFrame(() => {
        engine.resize();
        engine.loadStrokes(note.strokes || []);
      });
    } else {
      canvasWrap.classList.add("hidden");
      drawToolbar.classList.add("hidden");
      textArea.classList.remove("hidden");
      textArea.value = note.content || "";
      setTimeout(() => textArea.focus(), 50);
    }
  }

  function closeEditor() {
    if (saveTimer && currentId) {
      clearTimeout(saveTimer);
      const data =
        currentType === "drawing" ? { strokes: engine.getStrokes() } : { content: textArea.value };
      updateItem(uid, "notes", currentId, { ...data, title: editorTitle.value }).catch((e) =>
        showToast(e.message)
      );
    }
    saveTimer = null;
    editor.classList.add("hidden");
    currentId = null;
    currentType = null;
  }
  closeBtn.addEventListener("click", closeEditor);
  deleteBtn.addEventListener("click", async () => {
    if (!currentId) return;
    if (!confirm("Delete this note?")) return;
    try {
      await deleteItem(uid, "notes", currentId);
      closeEditor();
    } catch (e) {
      showToast(e.message);
    }
  });

  async function createNote(type) {
    try {
      const ref = await addItem(uid, "notes", {
        type,
        title: type === "drawing" ? "New Sketch" : "New Note",
        content: "",
        strokes: [],
      });
      openEditor({ id: ref.id, type, title: type === "drawing" ? "New Sketch" : "New Note", content: "", strokes: [] });
    } catch (e) {
      showToast(e.message);
    }
  }
  function render() {
    grid.innerHTML = "";
    emptyState.classList.toggle("hidden", notes.length > 0);

    const newTextCard = makeNewCard("Text note", "✎", () => createNote("text"));
    const newDrawCard = makeNewCard("Sketch", "✳", () => createNote("drawing"));
    grid.appendChild(newTextCard);
    grid.appendChild(newDrawCard);

    notes.forEach((n, i) => {
      const card = document.createElement("button");
      card.className = "note-card anim-in";
      card.style.setProperty("--stagger", Math.min(i, 10) * 25 + "ms");
      card.style.textAlign = "left";
      card.style.border = "1px solid var(--border)";
      card.innerHTML = `
        <span class="note-type-badge">${n.type === "drawing" ? "Sketch" : "Note"}</span>
        <h3></h3>
        ${n.type === "drawing" ? `<div class="note-preview-canvas"></div>` : `<div class="note-preview-text"></div>`}
        <div class="note-meta"></div>
      `;
      card.querySelector("h3").textContent = n.title || "Untitled";
      if (n.type === "text") {
        card.querySelector(".note-preview-text").textContent = n.content || "";
      } else {
        const previewWrap = card.querySelector(".note-preview-canvas");
        if (n.strokes && n.strokes.length) {
          const img = document.createElement("img");
          img.src = renderStrokesToDataUrl(n.strokes);
          previewWrap.appendChild(img);
        }
      }
      const meta = card.querySelector(".note-meta");
      meta.textContent = n.updatedAt?.toDate ? n.updatedAt.toDate().toLocaleDateString() : "";
      card.addEventListener("click", () => openEditor(n));
      grid.appendChild(card);
    });
  }

  function makeNewCard(label, glyph, onClick) {
    const card = document.createElement("button");
    card.className = "note-card new-note-card";
    card.innerHTML = `<span class="plus">${glyph}</span><span>${label}</span>`;
    card.addEventListener("click", onClick);
    return card;
  }

  const unsub = watchCollection(uid, "notes", "updatedAt", (items, err) => {
    if (err) { showToast("Sync error: " + err.message); return; }
    notes = items;
    render();
    if (currentId) {
      const still = items.find((n) => n.id === currentId);
      if (!still) closeEditor();
    }
  });

  return { destroy: () => { unsub(); closeEditor(); } };
}
