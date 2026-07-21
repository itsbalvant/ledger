// Local-calendar-day helpers.
//
// Never use `date.toISOString().slice(...)` to get "today" or "this month" —
// toISOString() converts through UTC first, which silently shifts the
// result back a calendar day for anyone in a timezone ahead of UTC (IST,
// most of Asia, Europe, Australia) during the hours right after local
// midnight. These read the local date fields directly instead.
export function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function localMonthStr(d = new Date()) {
  return localDateStr(d).slice(0, 7);
}
