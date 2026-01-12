import { useMemo } from 'react';
import { usePools, useUserPositions, useHealthFactor } from '../hook/useNavi';

type PortfolioRow = {
  symbol: string;
  coinType: string;
  supplied: number;
  borrowed: number;
  suppliedUsd: number;
  borrowedUsd: number;
  supplyApy: number;
  borrowApy: number;
  netAprPct: number;
};

type PortfolioSummary = {
  totalSuppliedUsd: number;
  totalBorrowedUsd: number;
  netAprPct: number;
  healthFactor: number;
};

export function usePortfolio() {
  const poolsQuery = usePools();
  const positionsQuery = useUserPositions();
  const healthQuery = useHealthFactor();

  const rows: PortfolioRow[] = useMemo(() => {
    if (!poolsQuery.data || !positionsQuery.data) return [];
    const poolMap = new Map(
      poolsQuery.data.map((p) => [
        p.coinType.toLowerCase(),
        p,
      ])
    );

    return positionsQuery.data.map((pos) => {
      const pool = poolMap.get(pos.coinType.toLowerCase());
      const decimals = pool?.decimals ?? 9;
      const price = pool?.price ?? 0;
      const supplied = Number(pos.suppliedRaw) / Math.pow(10, decimals);
      const borrowed = Number(pos.borrowedRaw) / Math.pow(10, decimals);
      const suppliedUsd = supplied * price;
      const borrowedUsd = borrowed * price;
      const supplyApy = pool?.supplyApy ?? 0;
      const borrowApy = pool?.borrowApy ?? 0;
      const netAprPct =
        suppliedUsd > 0
          ? ((suppliedUsd * supplyApy - borrowedUsd * borrowApy) /
              suppliedUsd) *
            100
          : 0;

      return {
        symbol: pos.symbol,
        coinType: pos.coinType,
        supplied,
        borrowed,
        suppliedUsd,
        borrowedUsd,
        supplyApy,
        borrowApy,
        netAprPct,
      };
    });
  }, [poolsQuery.data, positionsQuery.data]);

  const summary: PortfolioSummary = useMemo(() => {
    const totalSuppliedUsd = rows.reduce((s, r) => s + r.suppliedUsd, 0);
    const totalBorrowedUsd = rows.reduce((s, r) => s + r.borrowedUsd, 0);
    const netAprPct =
      totalSuppliedUsd > 0
        ? ((rows.reduce(
            (s, r) => s + r.suppliedUsd * r.supplyApy - r.borrowedUsd * r.borrowApy,
            0
          )) /
            totalSuppliedUsd) *
          100
        : 0;

    return {
      totalSuppliedUsd,
      totalBorrowedUsd,
      netAprPct,
      healthFactor: healthQuery.data ?? Infinity,
    };
  }, [rows, healthQuery.data]);

  return {
    rows,
    summary,
    isLoading: poolsQuery.isLoading || positionsQuery.isLoading || healthQuery.isLoading,
    isError: poolsQuery.isError || positionsQuery.isError || healthQuery.isError,
  };
}
