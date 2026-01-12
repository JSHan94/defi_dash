import { useEffect, useMemo, useState } from 'react';
import styles from './LoopingStrategy.module.css';
import { formatPercent } from '../utils/format';
import type { ChainId } from '../domain/types';
import { fetchWalletBalance, getLoopingMetrics } from '../integrations/looping';
import { SUPPORTED_TOKENS } from '../config/protocols';
import { useCoinBalance } from '../hook/useNavi';

interface LoopingStrategyProps {
  token: string;
  supplyApy: number;
  borrowApy: number;
  maxLtv: number;
  chain?: ChainId;
  protocolId?: string;
  onExecute?: (params: { amount: string; leverage: number }) => Promise<void>;
}

type TabId = 'deposit' | 'unwind' | 'adjust';

export function LoopingStrategy({
  token,
  supplyApy,
  borrowApy,
  maxLtv,
  chain,
  protocolId,
  onExecute,
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
  const suiToken = SUPPORTED_TOKENS.SUI;
  const { data: suiBalance } = useCoinBalance(suiToken.coinType, suiToken.decimals);

  useEffect(() => {
    let mounted = true;
    if (token === 'SUI' && suiBalance) {
      if (mounted) setWalletBalance(suiBalance.balance);
    } else {
      fetchWalletBalance({ chain, token }).then((balance) => {
        if (mounted) setWalletBalance(balance);
      });
    }
    return () => {
      mounted = false;
    };
  }, [chain, token, suiBalance]);

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
        <div className={styles.section}>
          <p className={styles.withdrawText}>
            Unwind your position and withdraw assets. This will repay your borrowed amount using the
            supplied collateral.
          </p>
          <div className={styles.inputGroup}>
            <label className={styles.srOnly} htmlFor={unwindAmountId}>
              Withdraw Amount
            </label>
            <input
              id={unwindAmountId}
              type="number"
              className={styles.input}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount to withdraw"
            />
            <span className={styles.tokenSuffix}>{token}</span>
          </div>
        </div>
      )}

      {activeTab === 'adjust' && (
        <div className={styles.section}>
          <div className={styles.sliderHeader}>
            <label className={styles.label} htmlFor={adjustSliderId}>
              Adjust Leverage
            </label>
            <span className={styles.leverageValue}>{leverage.toFixed(1)}x</span>
          </div>
          <div className={styles.sliderContainer}>
            <input
              id={adjustSliderId}
              type="range"
              min="1"
              max={maxLeverage * 0.95}
              step="0.1"
              value={leverage}
              onChange={handleSliderChange}
              className={styles.slider}
            />
          </div>
          <p className={styles.withdrawText} style={{ marginTop: '12px' }}>
            Adjusting leverage will automatically supply or withdraw assets to reach the target
            health factor.
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
        onClick={handleExecute}
        disabled={isSubmitting}
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
