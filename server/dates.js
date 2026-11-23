export const localDate = (day = new Date()) => day.toLocaleDateString('sv-SE');

export function shiftedLocalDate(days, base = new Date()) {
  const day = new Date(base);
  day.setDate(day.getDate() + days);
  return localDate(day);
}

export function isDateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
}
