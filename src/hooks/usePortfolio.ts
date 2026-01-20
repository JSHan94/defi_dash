import { useQuery } from '@tanstack/react-query';
import { useDefiDash } from './useDefiDash';
import { AccountPortfolio } from 'defi-dash-sdk';

export interface PortfolioSummary {
  totalSuppliedUsd: number;
  totalBorrowedUsd: number;
  netAprPct: number;
  healthFactor: number;
}

export function usePortfolioQuery() {
  const { getSDK, isConnected } = useDefiDash();

  const query = useQuery({
    queryKey: ['portfolio', 'aggregated'],
    queryFn: async () => {
      if (!isConnected) {
        console.log('[usePortfolio] Wallet not connected');
        return [];
      }
      try {
        const sdk = await getSDK();
        console.log('[usePortfolio] Fetching aggregated portfolio...');
        const data = await sdk.getAggregatedPortfolio();
        console.log('[usePortfolio] Fetched Data:', data);
        return data;
      } catch (e) {
        console.error('[usePortfolio] Error fetching portfolio:', e);
        throw e;
      }
    },
    enabled: isConnected,
    refetchInterval: 30000,
  });

  // Legacy compat / Helper processing
  const portfolios = query.data || [];

  // Calculate summary stats across ALL protocols
  let totalSuppliedUsd = 0;
  let totalBorrowedUsd = 0;
  let weightedNetEarnings = 0; // Annual net earnings
  let healthFactor = 0;

  // For simplicity, if multiple protocols, we might need to think about how to combine HF.
  // But typically user uses one main protocol or we show the worst one.
  // Let's grab the first non-empty protocol's HF or min HF?
  // Let's grab the minimum positive HF for safety.
  let minHealthFactor = Infinity;

  for (const p of portfolios) {
    if (p.totalCollateralUsd) totalSuppliedUsd += p.totalCollateralUsd;
    if (p.totalDebtUsd) totalBorrowedUsd += p.totalDebtUsd;
    if (p.totalAnnualNetEarningsUsd) weightedNetEarnings += p.totalAnnualNetEarningsUsd;

    if (p.healthFactor && p.healthFactor > 0 && p.healthFactor < minHealthFactor) {
      minHealthFactor = p.healthFactor;
    }
  }

  // Net APY = AnnualEarnings / NetValue
  const netValue = totalSuppliedUsd - totalBorrowedUsd;
  const netAprPct = netValue > 0 ? (weightedNetEarnings / netValue) * 100 : 0;

  const summary: PortfolioSummary = {
    totalSuppliedUsd,
    totalBorrowedUsd,
    netAprPct,
    healthFactor: minHealthFactor === Infinity ? 0 : minHealthFactor,
  };

  return {
    portfolios, // Full rich data
    summary,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
