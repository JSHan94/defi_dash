import { useMutation, useQuery } from '@tanstack/react-query';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import {
  depositCoinPTB,
  borrowCoinPTB,
  getPools,
  getPriceFeeds,
  updateOraclePricesPTB,
  normalizeCoinType,
} from '@naviprotocol/lending';
import { MetaAg } from '@7kprotocol/sdk-ts';
import { ScallopFlashLoanClient } from '../lib/scallop';
import { COIN_TYPES } from '../lib/const';

const GAS_BUDGET = 200_000_000;
const SLIPPAGE_BPS = 50; // 0.5%

export function useSuiPrice() {
  return useQuery({
    queryKey: ['price', 'sui'],
    queryFn: async () => {
      // Simple fallback: assume $1 if no price feed available
      try {
        const metaAg = new MetaAg({
          partner:
            '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf',
        });
        // Reuse quote with tiny amount to infer price
        const quotes = await metaAg.quote({
          amountIn: (1_000_000).toString(), // 1 USDC
          coinTypeIn: COIN_TYPES.USDC,
          coinTypeOut: COIN_TYPES.SUI,
        });
        if (!quotes.length) return 1;
        const best = quotes.sort((a, b) => Number(b.amountOut) - Number(a.amountOut))[0];
        const suiOut = Number(best.amountOut) / 1e9;
        if (suiOut === 0) return 1;
        return 1 / suiOut;
      } catch {
        return 1;
      }
    },
    staleTime: 60_000,
  });
}

export function useFlashloanLoop() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();
  const priceQuery = useSuiPrice();

  return useMutation({
    mutationFn: async ({
      depositAmount, // human SUI
      leverage,
    }: {
      depositAmount: string;
      leverage: number;
    }) => {
      if (!account?.address) throw new Error('Wallet not connected');
      if (leverage <= 1) throw new Error('Leverage must be greater than 1x');

      const pools = await getPools({ env: 'prod' });
      const poolsArr: any[] = Array.isArray(pools) ? pools : Object.values(pools);
      const suiPool = poolsArr.find(
        (p) => normalizeCoinType(p.coinType ?? p.suiCoinType ?? '') === normalizeCoinType(COIN_TYPES.SUI)
      );
      const usdcPool = poolsArr.find(
        (p) =>
          normalizeCoinType(p.coinType ?? p.suiCoinType ?? '') === normalizeCoinType(COIN_TYPES.USDC)
      );
      if (!suiPool) throw new Error('SUI pool not found in Navi');
      if (!usdcPool) throw new Error('USDC pool not found in Navi');

      const suiPrice = priceQuery.data ?? 1;
      const depositRaw = BigInt(Math.floor(parseFloat(depositAmount) * 1e9));
      const initialUsd = (Number(depositRaw) / 1e9) * suiPrice;
      const flashLoanUsd = initialUsd * (leverage - 1);
      const flashLoanUsdc = Math.ceil(flashLoanUsd * 1e6 * 1.02); // buffer 2%

      const metaAg = new MetaAg({
        partner:
          '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf',
      });
      const flashLoanClient = new ScallopFlashLoanClient();
      const priceFeeds = await getPriceFeeds({ env: 'prod' });
      const feed = priceFeeds.find(
        (f: any) => normalizeCoinType(f.coinType) === normalizeCoinType(suiPool.coinType)
      );

      const tx = new Transaction();
      tx.setSender(account.address);
      tx.setGasBudget(GAS_BUDGET);

      // Flashloan USDC
      const [loanCoin, receipt] = flashLoanClient.borrowFlashLoan(
        tx,
        BigInt(flashLoanUsdc),
        'usdc'
      );

      // Swap USDC -> SUI
      const quotes = await metaAg.quote({
        amountIn: flashLoanUsdc.toString(),
        coinTypeIn: COIN_TYPES.USDC,
        coinTypeOut: COIN_TYPES.SUI,
      });
      if (!quotes.length) throw new Error('No swap quotes USDC→SUI');
      const bestQuote = quotes.sort((a, b) => Number(b.amountOut) - Number(a.amountOut))[0];
      const swappedSui = await metaAg.swap(
        {
          quote: bestQuote,
          signer: account.address,
          coinIn: loanCoin,
          tx,
        },
        SLIPPAGE_BPS
      );

      // Split user deposit SUI from gas, merge with swapped SUI
      const [userDeposit] = tx.splitCoins(tx.gas, [depositRaw]);
      tx.mergeCoins(userDeposit, [swappedSui]);

      // Update oracle
      if (feed) {
        await updateOraclePricesPTB(tx as any, [feed], {
          env: 'prod',
          updatePythPriceFeeds: true,
        });
      }

      // Deposit merged SUI
      await depositCoinPTB(tx as any, suiPool, userDeposit, {
        amount: Number(depositRaw + BigInt(bestQuote.amountOut)),
        env: 'prod',
      });

      // Borrow USDC to repay flashloan
      const flashLoanFee = Math.ceil(flashLoanUsdc * (flashLoanClient as any).calculateFee
        ? Number((ScallopFlashLoanClient as any).calculateFee(BigInt(flashLoanUsdc)))
        : flashLoanUsdc * 0.0006 + 10);
      const repayAmount = flashLoanUsdc + flashLoanFee;
      const borrowedUsdc = await borrowCoinPTB(tx as any, usdcPool, repayAmount, { env: 'prod' });

      // Repay flashloan
      flashLoanClient.repayFlashLoan(tx, borrowedUsdc as any, receipt, 'usdc');

      const result = await signAndExecute({
        transaction: tx,
        options: { showEffects: true },
      });

      return result.digest;
    },
  });
}
