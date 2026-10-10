export const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);

export function minutes(m: number | null) {
  if (m === null) return "—";
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return h < 24 ? `${h.toFixed(h < 10 ? 1 : 0)} h` : `${Math.round(h / 24)} d`;
}

export const PERIODS = [7, 30, 90] as const;
export const periodOf = (v: string | undefined) => (PERIODS.includes(Number(v) as 7) ? Number(v) : 30);
