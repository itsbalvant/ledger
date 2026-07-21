// Pressure-aware drawing engine for the notes canvas.
// Strokes are stored as vector JSON: [{ color, width, tool, points: [{x,y,p}] }]
// x/y are stored normalized (0..1) so a note renders crisply at any canvas size.

const COLORS = ["#1c1b19", "#b5502f", "#3b6ea5", "#4c7a52"];
const WIDTHS = [2.5, 5, 9];

// Standalone renderer (no DOM listeners attached) — safe to call repeatedly,
// e.g. for note-grid thumbnails, without leaking event handlers.
export function renderStrokesToDataUrl(strokes, width = 300, height = 345, bgColor = "#ece7de") {
  const off = document.createElement("canvas");
  off.width = width;
  off.height = height;
  const ctx = off.getContext("2d");
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, off.width, off.height);
  for (const s of strokes || []) {
    if (s.points.length < 2) continue;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = s.tool === "eraser" ? bgColor : s.color;
    for (let i = 1; i < s.points.length; i++) {
      const p0 = s.points[i - 1], p1 = s.points[i];
      ctx.beginPath();
      ctx.lineWidth = Math.max(1, s.width * (0.5 + (p1.p || 0.5)));
      ctx.moveTo(p0.x * off.width, p0.y * off.height);
      ctx.lineTo(p1.x * off.width, p1.y * off.height);
      ctx.stroke();
    }
  }
  return off.toDataURL("image/png");
}

export function createDrawingEngine(canvasEl) {
  const ctx = canvasEl.getContext("2d");
  let strokes = [];
  let currentStroke = null;
  let color = COLORS[0];
  let widthIdx = 1;
  let tool = "pen"; // 'pen' | 'eraser'
  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let onChange = () => {};

  function resize() {
    const rect = canvasEl.getBoundingClientRect();
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvasEl.width = Math.round(rect.width * dpr);
    canvasEl.height = Math.round(rect.height * dpr);
    render();
  }

  function toCanvasXY(nx, ny) {
    return [nx * canvasEl.width, ny * canvasEl.height];
  }

  function strokeWidthPx(baseWidth, pressure) {
    const p = pressure && pressure > 0 ? pressure : 0.5;
    return baseWidth * dpr * (0.5 + p * 1.1);
  }

  function drawStroke(s) {
    if (s.points.length < 1) return;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = s.tool === "eraser" ? "#000000" : s.color;
    ctx.globalCompositeOperation = s.tool === "eraser" ? "destination-out" : "source-over";

    if (s.points.length === 1) {
      const [x, y] = toCanvasXY(s.points[0].x, s.points[0].y);
      ctx.beginPath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.arc(x, y, strokeWidthPx(s.width, s.points[0].p) / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    for (let i = 1; i < s.points.length; i++) {
      const p0 = s.points[i - 1];
      const p1 = s.points[i];
      const [x0, y0] = toCanvasXY(p0.x, p0.y);
      const [x1, y1] = toCanvasXY(p1.x, p1.y);
      ctx.beginPath();
      ctx.lineWidth = strokeWidthPx(s.width, p1.p);
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function render() {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    for (const s of strokes) drawStroke(s);
    if (currentStroke) drawStroke(currentStroke);
  }

  function pointFromEvent(e) {
    const rect = canvasEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const p = e.pointerType === "pen" ? (e.pressure || 0.5) : e.pressure && e.pressure !== 0.5 ? e.pressure : 0.5;
    return { x: clamp01(x), y: clamp01(y), p };
  }
  function clamp01(v) { return Math.min(1, Math.max(0, v)); }

  let activePointerId = null;

  // Palm rejection: only Apple Pencil ('pen') or a mouse draws. Touch input
  // (fingers, a resting palm) is always ignored for drawing — we still
  // preventDefault on it so it can't trigger iOS's text-selection/callout
  // gesture on top of the canvas.
  function onPointerDown(e) {
    if (e.pointerType === "touch") {
      e.preventDefault();
      return;
    }
    activePointerId = e.pointerId;
    canvasEl.setPointerCapture(e.pointerId);
    currentStroke = {
      tool,
      color,
      width: WIDTHS[widthIdx],
      points: [pointFromEvent(e)],
    };
    render();
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (e.pointerType === "touch") {
      e.preventDefault();
      return;
    }
    if (!currentStroke || e.pointerId !== activePointerId) return;
    // coalesced events give smoother lines with Pencil
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events.length ? events : [e]) {
      currentStroke.points.push(pointFromEvent(ev));
    }
    render();
    e.preventDefault();
  }

  function endStroke(e) {
    if (e && e.pointerType === "touch") {
      e.preventDefault();
      return;
    }
    if (!currentStroke || (e && e.pointerId !== activePointerId)) return;
    if (currentStroke.points.length) {
      strokes.push(currentStroke);
      onChange(strokes);
    }
    currentStroke = null;
    activePointerId = null;
    render();
  }

  canvasEl.addEventListener("pointerdown", onPointerDown);
  canvasEl.addEventListener("pointermove", onPointerMove);
  canvasEl.addEventListener("pointerup", endStroke);
  canvasEl.addEventListener("pointercancel", endStroke);
  canvasEl.addEventListener("pointerleave", (e) => {
    if (e.pointerId === activePointerId) endStroke(e);
  });

  window.addEventListener("resize", resize);

  return {
    COLORS,
    WIDTHS,
    setColor(c) { color = c; },
    setWidthIdx(i) { widthIdx = i; },
    setTool(t) { tool = t; },
    getTool: () => tool,
    getColor: () => color,
    getWidthIdx: () => widthIdx,
    undo() {
      strokes.pop();
      onChange(strokes);
      render();
    },
    clear() {
      strokes = [];
      onChange(strokes);
      render();
    },
    loadStrokes(s) {
      strokes = Array.isArray(s) ? JSON.parse(JSON.stringify(s)) : [];
      render();
    },
    getStrokes: () => strokes,
    isEmpty: () => strokes.length === 0,
    resize,
    onStrokesChange(fn) { onChange = fn; },
  };
}
