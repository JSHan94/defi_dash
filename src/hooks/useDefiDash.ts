/**
 * useDefiDash Hook
 *
 * Clean SDK integration for browser wallet using defi-dash-sdk
 */
import { useCallback, useRef } from 'react';
import { useCurrentAccount, useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';
import * as DefiDashSDKLib from 'defi-dash-sdk';
import type {
  DefiDashSDK as DefiDashSDKType,
  LendingProtocol as LendingProtocolType,
  BrowserLeverageParams,
} from 'defi-dash-sdk';

// Extract values
const { DefiDashSDK, LendingProtocol } = DefiDashSDKLib;

// Define local types matching the library
type DefiDashSDK = DefiDashSDKType;
type LendingProtocol = LendingProtocolType;

export { LendingProtocol };

export interface LeverageParams {
  protocol: LendingProtocol;
  depositAsset: string;
  depositAmount: string;
  multiplier: number;
}

export function useDefiDash() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const sdkRef = useRef<DefiDashSDK | null>(null);

  // Initialize SDK (lazy)
  const getSDK = useCallback(async () => {
    if (!account?.address) throw new Error('Wallet not connected');

    if (!sdkRef.current) {
      sdkRef.current = new DefiDashSDK();
      await sdkRef.current.initialize(suiClient as any, account.address);
    }
    return sdkRef.current;
  }, [account, suiClient]);

  // Open Leverage Position
  const openLeverage = useCallback(
    async (params: LeverageParams) => {
      const sdk = await getSDK();

      const tx = new Transaction();
      tx.setSender(account!.address);
      tx.setGasBudget(200_000_000);

      await sdk.buildLeverageTransaction(tx, params);

      return signAndExecute({ transaction: tx as any });
    },
    [account, getSDK, signAndExecute]
  );

  // Close Position (Deleverage)
  const closeLeverage = useCallback(
    async (protocol: LendingProtocol) => {
      const sdk = await getSDK();

      const tx = new Transaction();
      tx.setSender(account!.address);
      tx.setGasBudget(200_000_000);

      await sdk.buildDeleverageTransaction(tx, { protocol });

      return signAndExecute({ transaction: tx as any });
    },
    [account, getSDK, signAndExecute]
  );

  // Get Current Position
  const getPosition = useCallback(
    async (protocol: LendingProtocol) => {
      const sdk = await getSDK();
      return sdk.getPosition(protocol);
    },
    [getSDK]
  );

  // Dry Run (Simulation)
  const dryRunLeverage = useCallback(
    async (params: LeverageParams) => {
      const sdk = await getSDK();

      const tx = new Transaction();
      tx.setSender(account!.address);
      tx.setGasBudget(200_000_000);

      await sdk.buildLeverageTransaction(tx, params);

      const result = await suiClient.dryRunTransactionBlock({
        transactionBlock: await tx.build({ client: suiClient as any }),
      });

      return {
        success: result.effects.status.status === 'success',
        error: result.effects.status.error,
        effects: result.effects,
      };
    },
    [account, getSDK, suiClient]
  );

  const getPortfolio = useCallback(async () => {
    const sdk = await getSDK();
    return sdk.getAggregatedPortfolio();
  }, [getSDK]);

  const getMarkets = useCallback(async () => {
    const sdk = await getSDK();
    return sdk.getAggregatedMarkets();
  }, [getSDK]);

  const previewLeverage = useCallback(
    async (params: { depositAsset: string; depositAmount: string; multiplier: number }) => {
      const sdk = await getSDK();
      return sdk.previewLeverage(params);
    },
    [getSDK]
  );

  const getBalances = useCallback(async () => {
    // Use native suiClient directly
    if (!account?.address) return [];
    return suiClient.getAllBalances({ owner: account.address });
  }, [account, suiClient]);

  const getTokenBalance = useCallback(
    async (coinType: string) => {
      // Use native suiClient directly for simple balance checks
      if (!account?.address) return '0';
      const balance = await suiClient.getBalance({
        owner: account.address,
        coinType,
      });
      return balance.totalBalance;
    },
    [account, suiClient]
  );

  return {
    isConnected: !!account?.address,
    address: account?.address,
    openLeverage,
    closeLeverage,
    getPosition,
    dryRunLeverage,
    getPortfolio,
    getMarkets,
    previewLeverage,
    getBalances,
    getTokenBalance,
  };
}

export type PortfolioRow = {
  protocol: string;
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

export type PortfolioSummary = {
  totalSuppliedUsd: number;
  totalBorrowedUsd: number;
  netAprPct: number;
  healthFactor: number;
};

export function usePortfolioQuery() {
  const { getPortfolio, isConnected } = useDefiDash();

  const query = useQuery({
    queryKey: ['portfolio', 'aggregated'],
    queryFn: async () => {
      if (!isConnected) return null;
      const portfolios = await getPortfolio();

      const rows: PortfolioRow[] = [];
      let totalSuppliedUsd = 0;
      let totalBorrowedUsd = 0;
      let totalWeightedNetApr = 0;
      let minHealthFactor = Infinity;

      for (const p of portfolios) {
        if (p.healthFactor && p.healthFactor > 0 && p.healthFactor < minHealthFactor) {
          minHealthFactor = p.healthFactor;
        }

        const assetMap = new Map<string, Partial<PortfolioRow>>();

        for (const pos of p.positions) {
          const key = pos.coinType;
          if (!assetMap.has(key)) {
            assetMap.set(key, {
              protocol: p.protocol,
              symbol: pos.symbol,
              coinType: pos.coinType,
              supplied: 0,
              borrowed: 0,
              suppliedUsd: 0,
              borrowedUsd: 0,
              supplyApy: 0,
              borrowApy: 0,
            });
          }
          const row = assetMap.get(key)!;

          if (pos.side === 'supply') {
            row.supplied = pos.amount;
            row.suppliedUsd = pos.valueUsd;
            row.supplyApy = pos.apy;
          } else {
            row.borrowed = pos.amount;
            row.borrowedUsd = pos.valueUsd;
            row.borrowApy = pos.apy;
          }
        }

        for (const r of assetMap.values()) {
          const suppliedUsd = r.suppliedUsd || 0;
          const borrowedUsd = r.borrowedUsd || 0;
          const supplyApy = r.supplyApy || 0;
          const borrowApy = r.borrowApy || 0;

          const netAprPct =
            suppliedUsd > 0 ? (suppliedUsd * supplyApy - borrowedUsd * borrowApy) / suppliedUsd : 0;

          const fullRow: PortfolioRow = {
            protocol: r.protocol!,
            symbol: r.symbol!,
            coinType: r.coinType!,
            supplied: r.supplied || 0,
            borrowed: r.borrowed || 0,
            suppliedUsd,
            borrowedUsd,
            supplyApy,
            borrowApy,
            netAprPct,
          };

          rows.push(fullRow);

          totalSuppliedUsd += suppliedUsd;
          totalBorrowedUsd += borrowedUsd;
          totalWeightedNetApr += suppliedUsd * supplyApy - borrowedUsd * borrowApy;
        }
      }

      const netAprPct = totalSuppliedUsd > 0 ? totalWeightedNetApr / totalSuppliedUsd : 0;

      return {
        rows,
        summary: {
          totalSuppliedUsd,
          totalBorrowedUsd,
          netAprPct,
          healthFactor: minHealthFactor === Infinity ? 0 : minHealthFactor,
        },
      };
    },
    enabled: isConnected,
    refetchInterval: 30000,
  });

  return {
    rows: query.data?.rows || [],
    summary: query.data?.summary || {
      totalSuppliedUsd: 0,
      totalBorrowedUsd: 0,
      netAprPct: 0,
      healthFactor: Infinity,
    },
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useLeverageTransaction() {
  const { openLeverage } = useDefiDash();

  return useMutation({
    mutationFn: async ({
      depositAmount,
      leverage,
      symbol = 'SUI',
      protocol = LendingProtocol.Suilend,
    }: {
      depositAmount: string;
      leverage: number;
      symbol?: string;
      protocol?: LendingProtocol;
    }) => {
      const result = await openLeverage({
        protocol,
        depositAsset: symbol,
        depositAmount,
        multiplier: leverage,
      });

      if (!result) {
        throw new Error('Transaction execution failed');
      }

      return result.digest;
    },
  });
}

export function useDeleverageTransaction() {
  const { closeLeverage } = useDefiDash();

  return useMutation({
    mutationFn: async ({ protocol }: { protocol: LendingProtocol }) => {
      const result = await closeLeverage(protocol);

      if (!result) {
        throw new Error('Transaction execution failed');
      }

      return result.digest;
    },
  });
}
