import type { ChainId } from '../domain/types';

export type LoopingMetricsInput = {
  supplyApy: number;
  borrowApy: number;
  maxLtv: number;
  leverage: number;
};

export type LoopingMetrics = {
  maxLeverage: number;
  netApy: number;
  healthFactor: number;
};

export type WalletBalanceInput = {
  chain?: ChainId;
  token: string;
};

export async function fetchWalletBalance({ chain }: WalletBalanceInput): Promise<string> {
  // TODO: replace with wallet-connected balance lookup; default to zero to avoid mock data.
  return chain ? '0' : '0';
}

export function getLoopingMetrics({
  supplyApy,
  borrowApy,
  maxLtv,
  leverage,
}: LoopingMetricsInput): LoopingMetrics {
  const maxLeverage = maxLtv >= 1 ? 10 : Math.floor((1 / (1 - maxLtv)) * 10) / 10;
  const supplyIncome = supplyApy * leverage;
  const borrowCost = borrowApy * (leverage - 1);
  const netApy = supplyIncome - borrowCost;

  let healthFactor = Infinity;
  if (leverage !== 1) {
    const currentLtv = (leverage - 1) / leverage;
    if (currentLtv !== 0) {
      healthFactor = maxLtv / currentLtv;
    }
  }

  return { maxLeverage, netApy, healthFactor };
}
