import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import styles from '../App.module.css';
import { LoopingStrategy } from '../components/LoopingStrategy';
import { protocols, SUPPORTED_TOKENS } from '../config/protocols';
import {
  useLeverageTransaction,
  useDeleverageTransaction,
  LendingProtocol,
} from '../hooks/useDefiDash';
import { Toast, ToastMessage } from '../components/Toast';

// Defaults are indicative only; real APYs should be fetched from protocol later
const DEFAULT_SUPPLY_APY = 0.08; // 8% supply on SUI
const DEFAULT_BORROW_APY = 0.04; // 4% borrow on USDC
const DEFAULT_MAX_LTV = 0.6; // conservative buffer

type ProtocolId = 'navi' | 'suilend';

export function StrategyPage() {
  const [selectedProtocol, setSelectedProtocol] = useState<ProtocolId>('navi');
  const [selectedToken, setSelectedToken] = useState<string>('SUI');
  const { mutateAsync: flashloanLoop, isPending: isPendingLoop } = useLeverageTransaction();
  const { mutateAsync: deleverage, isPending: isPendingClose } = useDeleverageTransaction();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const queryClient = useQueryClient();

  const protocolOptions = useMemo(
    () =>
      protocols
        .filter((p) => p.id === 'navi' || p.id === 'suilend')
        .map((p) => ({
          id: p.id as ProtocolId,
          name: p.name,
        })),
    []
  );

  const tokenOptions = useMemo(
    () => Object.values(SUPPORTED_TOKENS).filter((t) => t.symbol === 'SUI' || t.symbol === 'LBTC'),
    []
  );

  const handleExecute = async ({ amount, leverage }: { amount: string; leverage: number }) => {
    setToast(null);
    console.log('[StrategyPage] Executing Open Leverage:', {
      token: selectedToken,
      protocol: selectedProtocol,
      amount,
      leverage,
    });

    try {
      if (leverage <= 1) {
        throw new Error('Leverage must be greater than 1x to run flashloan loop.');
      }

      // Map protocol string to Enum
      const protocolEnum =
        selectedProtocol === 'navi' ? LendingProtocol.Navi : LendingProtocol.Suilend;

      const digest = await flashloanLoop({
        depositAmount: amount,
        leverage,
        symbol: selectedToken,
        protocol: protocolEnum,
      });

      console.log('[StrategyPage] Open Success:', digest);
      setToast({ type: 'success', message: `Position Opened! Digest: ${digest.slice(0, 10)}...` });

      // Wait for RPC indexing
      setTimeout(async () => {
        await queryClient.invalidateQueries({ queryKey: ['balance'] });
        // Also invalidate portfolio/positions if we had them
        await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      }, 2000);
    } catch (err: unknown) {
      console.error('[StrategyPage] Open Failed:', err);
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      setToast({ type: 'error', message: msg });
    }
  };

  const handleClose = async () => {
    setToast(null);
    console.log('[StrategyPage] Executing Close Position:', {
      protocol: selectedProtocol,
    });

    try {
      const protocolEnum =
        selectedProtocol === 'navi' ? LendingProtocol.Navi : LendingProtocol.Suilend;
      const digest = await deleverage({ protocol: protocolEnum });

      console.log('[StrategyPage] Close Success:', digest);
      setToast({ type: 'success', message: `Position Closed! Digest: ${digest.slice(0, 10)}...` });

      // Wait for RPC indexing
      setTimeout(async () => {
        await queryClient.invalidateQueries({ queryKey: ['balance'] });
        await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      }, 2000);
    } catch (err: unknown) {
      console.error('[StrategyPage] Close Failed:', err);
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      setToast({ type: 'error', message: msg });
    }
  };

  return (
    <main className={styles.content}>
      <section style={{ maxWidth: 820, margin: '0 auto', width: '100%' }}>
        <h2 style={{ marginBottom: 12 }}>{selectedToken} → USDC Leverage Loop</h2>
        <p style={{ marginBottom: 20, color: 'var(--text-secondary)' }}>
          Deposit {selectedToken}, borrow USDC, swap back to {selectedToken}, and repeat using
          Scallop flash loans. Select a protocol below, adjust leverage, then execute with your
          connected Sui wallet.
        </p>

        {/* Token Selector */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {tokenOptions.map((t) => (
            <button
              key={t.symbol}
              type="button"
              onClick={() => setSelectedToken(t.symbol)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: selectedToken === t.symbol ? '1px solid #6cf' : '1px solid #333',
                background: selectedToken === t.symbol ? 'rgba(108,190,255,0.12)' : 'transparent',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {t.icon && (
                <img
                  src={t.icon}
                  alt={t.symbol}
                  width={16}
                  height={16}
                  style={{ borderRadius: '50%' }}
                />
              )}
              {t.name}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {protocolOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedProtocol(option.id)}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: selectedProtocol === option.id ? '1px solid #6cf' : '1px solid #333',
                background:
                  selectedProtocol === option.id ? 'rgba(108,190,255,0.12)' : 'transparent',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              {option.name}
            </button>
          ))}
        </div>

        <LoopingStrategy
          token={selectedToken}
          supplyApy={DEFAULT_SUPPLY_APY}
          borrowApy={DEFAULT_BORROW_APY}
          maxLtv={DEFAULT_MAX_LTV}
          chain="sui"
          protocolId={selectedProtocol}
          onExecute={handleExecute}
          onClose={handleClose}
        />
        {(isPendingLoop || isPendingClose) && (
          <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>
            {isPendingLoop ? 'Submitting Open Transaction...' : 'Submitting Close Transaction...'}
          </p>
        )}
      </section>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}
