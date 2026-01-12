import { SUPPORTED_TOKENS } from './protocols';

export function formatAmount(amount: bigint, decimals: number): string {
  const factor = BigInt(10) ** BigInt(decimals);
  const whole = amount / factor;
  const frac = amount % factor;
  if (frac === BigInt(0)) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fracStr}`;
}

export function parseAmount(value: string, decimals: number): bigint {
  const [wholePart, fracPart = ''] = value.trim().split('.');
  const cleanWhole = wholePart === '' ? '0' : wholePart;
  const fracPadded = (fracPart + '0'.repeat(decimals)).slice(0, decimals);
  const whole = BigInt(cleanWhole);
  const frac = BigInt(fracPadded);
  return whole * BigInt(10) ** BigInt(decimals) + frac;
}

export function getTokenByCoinType(coinType: string) {
  const normalized = coinType.toLowerCase();
  return Object.values(SUPPORTED_TOKENS).find(
    (t) => t.coinType.toLowerCase() === normalized
  );
}

export { SUPPORTED_TOKENS } from './protocols';
