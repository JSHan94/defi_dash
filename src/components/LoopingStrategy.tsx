import { useEffect, useMemo, useState } from 'react';
import styles from './LoopingStrategy.module.css';

import type { ChainId } from '../domain/types';
import { SUPPORTED_TOKENS } from '../config/protocols';
import { useDefiDash } from '../hooks/useDefiDash';
import { useQuery } from '@tanstack/react-query';
import { formatPercent, formatUnits } from '../utils/format';

interface LoopingStrategyProps {
  token: string;
  supplyApy: number;
  borrowApy: number;
  maxLtv: number;
  chain?: ChainId;
  protocolId?: string;
  onExecute?: (params: { amount: string; leverage: number }) => Promise<void>;
  onClose?: () => Promise<void>;
}

type TabId = 'deposit' | 'unwind' | 'adjust';

// Helper math for UI metrics
function getLoopingMetrics({
  supplyApy,
  borrowApy,
  maxLtv,
  leverage,
}: {
  supplyApy: number;
  borrowApy: number;
  maxLtv: number;
  leverage: number;
}) {
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

export function LoopingStrategy({
  token,
  supplyApy,
  borrowApy,
  maxLtv,
  chain,
  protocolId,
  onExecute,
  onClose,
}: LoopingStrategyProps) {
  const depositAmountId = 'deposit-amount';
  const unwindAmountId = 'unwind-amount';
  const leverageSliderId = 'leverage-slider';
  const adjustSliderId = 'adjust-slider';
  const [activeTab, setActiveTab] = useState<TabId>('deposit');
  const [amount, setAmount] = useState<string>('1');
  const [leverage, setLeverage] = useState<number>(1.2);
  const [walletBalance, setWalletBalance] = useState<string>('0');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { getTokenBalance, isConnected } = useDefiDash();
  const tokenConfig = SUPPORTED_TOKENS[token as keyof typeof SUPPORTED_TOKENS];

  const balanceQuery = useQuery({
    queryKey: ['balance', token, tokenConfig?.coinType],
    queryFn: async () => {
      console.log('[LoopingStrategy] Fetching balance for:', token);
      console.log('[LoopingStrategy] Config:', tokenConfig);

      if (tokenConfig) {
        const raw = await getTokenBalance(tokenConfig.coinType);
        console.log('[LoopingStrategy] Raw Balance:', raw);
        return formatUnits(BigInt(raw), tokenConfig.decimals);
      }
      return '0';
    },
    enabled: isConnected && !!tokenConfig,
  });

  useEffect(() => {
    if (balanceQuery.data) {
      setWalletBalance(balanceQuery.data);
    }
  }, [balanceQuery.data]);

  const liquidationThreshold = Math.min(0.95, maxLtv + 0.05); // Slight buffer over max LTV

  const { maxLeverage, netApy, healthFactor, liquidationPrice } = useMemo(() => {
    const metrics = getLoopingMetrics({ supplyApy, borrowApy, maxLtv, leverage });

    const borrowed = leverage - 1;
    const coll = leverage;
    const liqPrice = borrowed / (coll * liquidationThreshold);

    return { ...metrics, liquidationPrice: liqPrice };
  }, [supplyApy, borrowApy, maxLtv, leverage]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLeverage(parseFloat(e.target.value));
  };

  const handleExecute = async () => {
    if (!onExecute) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await onExecute({ amount, leverage });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'Execution failed';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = async () => {
    if (!onClose) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'Close failed';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const setMaxBalance = () => {
    setAmount(walletBalance);
  };

  const getHealthColor = (hf: number) => {
    if (hf === Infinity) return styles.good;
    if (hf > 1.5) return styles.good;
    if (hf > 1.1) return styles.warning;
    return styles.danger;
  };

  const isHighRisk = healthFactor < 1.1 && healthFactor !== Infinity;

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'deposit' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('deposit')}
        >
          Deposit {protocolId ? `(${protocolId})` : ''}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'unwind' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('unwind')}
        >
          Unwind
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'adjust' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('adjust')}
        >
          Adjust
        </button>
      </div>

      {activeTab === 'deposit' && (
        <>
          <div className={styles.section}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor={depositAmountId}>
                Deposit Amount
              </label>
              <button type="button" className={styles.balanceLabel} onClick={setMaxBalance}>
                Max: {walletBalance} {token}
              </button>
            </div>
            <div className={styles.inputGroup}>
              <input
                id={depositAmountId}
                type="number"
                className={`${styles.input} ${parseFloat(amount) > parseFloat(walletBalance) ? styles.inputError : ''}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
              />
              <span className={styles.tokenSuffix}>{token}</span>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sliderHeader}>
              <label className={styles.label} htmlFor={leverageSliderId}>
                Leverage
              </label>
              <span className={styles.leverageValue}>{leverage.toFixed(1)}x</span>
            </div>
            <div className={styles.sliderContainer}>
              <input
                id={leverageSliderId}
                type="range"
                min="1.05"
                max={maxLeverage * 0.95}
                step="0.1"
                value={leverage}
                onChange={handleSliderChange}
                className={styles.slider}
              />
            </div>
          </div>
        </>
      )}

      {activeTab === 'unwind' && (
        <div className={styles.section} style={{ textAlign: 'center', padding: '32px 0' }}>
          <h3 style={{ marginBottom: '8px' }}>Unwind Position</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            This will repay all borrowed assets and withdraw your collateral.
          </p>
        </div>
      )}

      {activeTab === 'adjust' && (
        <div className={styles.section} style={{ textAlign: 'center', padding: '32px 0' }}>
          <h3 style={{ marginBottom: '8px' }}>Coming Soon</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Leverage adjustment is currently under development.
          </p>
        </div>
      )}

      {isHighRisk && (
        <div className={styles.warningBox}>
          <span className={styles.warningIcon}>⚠️</span>
          <span>High Liquidation Risk! Monitor your position closely.</span>
        </div>
      )}

      {submitError && <div className={styles.errorBox}>{submitError}</div>}

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Net APY</span>
          <span className={`${styles.metricValue} ${netApy >= 0 ? styles.good : styles.danger}`}>
            {formatPercent(netApy)}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Health Factor</span>
          <span className={`${styles.metricValue} ${getHealthColor(healthFactor)}`}>
            {healthFactor === Infinity ? '∞' : healthFactor.toFixed(2)}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Liq. Price (est)</span>
          <span className={styles.metricValue}>
            {liquidationPrice > 0 ? `$${liquidationPrice.toFixed(4)}` : '-'}
          </span>
        </div>
      </div>

      <button
        type="button"
        className={`${styles.actionButton} ${isHighRisk ? styles.dangerButton : ''}`}
        onClick={
          activeTab === 'deposit' ? handleExecute : activeTab === 'unwind' ? handleClose : undefined
        }
        disabled={isSubmitting || (activeTab !== 'deposit' && activeTab !== 'unwind')}
      >
        {isSubmitting
          ? 'Submitting...'
          : activeTab === 'deposit'
            ? 'Start Looping'
            : activeTab === 'unwind'
              ? 'Unwind & Withdraw'
              : 'Update Position'}
      </button>
    </div>
  );
}
