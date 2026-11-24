import { Decimal } from "decimal.js";

// all money math goes through Decimal. values stay strings everywhere else.
export { Decimal };

export function toDecimal(value: string): Decimal | null {
  try {
    const d = new Decimal(value);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

// display formatting: rounds down to the given decimals, groups thousands
export function formatAmount(value: string | Decimal, decimals: number): string {
  const d = typeof value === "string" ? toDecimal(value) : value;
  if (!d) return "-";
  const fixed = d.toFixed(decimals, Decimal.ROUND_DOWN);
  const [int = "0", frac] = fixed.split(".");
  const negative = int.startsWith("-");
  const digits = negative ? int.slice(1) : int;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${frac !== undefined ? `.${frac}` : ""}`;
}

// canonical key for a price level, so "150.5" and "150.50000000" are one level
export function levelKey(price: string): string {
  return new Decimal(price).toFixed(8);
}
