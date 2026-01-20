export const formatNumber = (value: number, digits?: number): string => {
  if (digits !== undefined) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
};

export const formatPercent = (value: number): string => `${(value * 100).toFixed(2)}%`;
export const formatPercentValue = (value: number): string => `${value.toFixed(2)}%`;

/**
 * Formats a raw token amount to a human-readable string.
 * Copied from SDK to avoid CJS interop issues in Vite.
 */
export function formatUnits(amount: string | number | bigint, decimals: number): string {
  const s = amount.toString();
  if (decimals === 0) return s;
  const pad = s.padStart(decimals + 1, '0');
  const transition = pad.length - decimals;
  return `${pad.slice(0, transition)}.${pad.slice(transition)}`.replace(/\.?0+$/, '') || '0';
}

export function parseUnits(amount: string, decimals: number): bigint {
  const [integer, fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(integer + paddedFraction);
}
