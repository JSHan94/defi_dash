import { useMemo, useState } from 'react';
import styles from '../App.module.css';
import { LoopingStrategy } from '../components/LoopingStrategy';
import { protocols, SUPPORTED_TOKENS } from '../config/protocols';
import { useFlashloanLeverage } from '../hook/useNavi';
import { useFlashloanLoop } from '../hooks/useFlashloanLoop';

// Defaults are indicative only; real APYs should be fetched from protocol later
const DEFAULT_SUPPLY_APY = 0.08; // 8% supply on SUI
const DEFAULT_BORROW_APY = 0.04; // 4% borrow on USDC
const DEFAULT_MAX_LTV = 0.6; // conservative buffer

type ProtocolId = 'navi' | 'suilend';

export function StrategyPage() {
  const [selectedProtocol, setSelectedProtocol] = useState<ProtocolId>('navi');
  const { mutateAsync: flashloanLeverage, isPending } = useFlashloanLeverage();
  const { mutateAsync: flashloanLoop, isPending: isPendingLoop } = useFlashloanLoop();

  const protocolOptions = useMemo(
    () =>
      protocols.filter((p) => p.id === 'navi' || p.id === 'suilend').map((p) => ({
        id: p.id as ProtocolId,
        name: p.name,
      })),
    []
  );

  const handleExecute = async ({ amount, leverage }: { amount: string; leverage: number }) => {
    if (leverage <= 1) {
      throw new Error('Leverage must be greater than 1x to run flashloan loop.');
    }
    // For now, execution path uses Navi flashloan leverage hook.
    // When Suilend path is ready, branch here.
    if (selectedProtocol === 'navi') {
      const depositAmount = amount; // SUI
      await flashloanLoop({ depositAmount, leverage });
    } else {
      throw new Error('Suilend execution is not yet wired. Please select Navi.');
    }
  };

  return (
    <main className={styles.content}>
      <section style={{ maxWidth: 820, margin: '0 auto', width: '100%' }}>
        <h2 style={{ marginBottom: 12 }}>Sui → USDC Leverage Loop</h2>
        <p style={{ marginBottom: 20, color: 'var(--text-secondary)' }}>
          Deposit SUI, borrow USDC, swap back to SUI, and repeat using Scallop flash loans.
          Select a protocol below, adjust leverage, then execute with your connected Sui wallet.
        </p>

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
                background: selectedProtocol === option.id ? 'rgba(108,190,255,0.12)' : 'transparent',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              {option.name}
              {option.id === 'suilend' && ' (coming soon)'}
            </button>
          ))}
        </div>

        <LoopingStrategy
          token="SUI"
          supplyApy={DEFAULT_SUPPLY_APY}
          borrowApy={DEFAULT_BORROW_APY}
          maxLtv={DEFAULT_MAX_LTV}
          chain="sui"
          protocolId={selectedProtocol}
          onExecute={handleExecute}
        />
        {(isPending || isPendingLoop) && (
          <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>Submitting transaction...</p>
        )}
      </section>
    </main>
  );
}
