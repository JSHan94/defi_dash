/**
 * useDefiDash Hook
 *
 * Clean SDK integration for browser wallet using defi-dash-sdk
 */
import { useCallback, useRef } from 'react';
import { useCurrentAccount, useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
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

  return {
    isConnected: !!account?.address,
    address: account?.address,
    openLeverage,
    closeLeverage,
    getPosition,
    dryRunLeverage,
  };
}
