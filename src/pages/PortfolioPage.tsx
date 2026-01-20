import { useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { LoopingStrategy } from '../components/LoopingStrategy';
import styles from './PortfolioPage.module.css';
import appStyles from '../App.module.css';
import { formatNumber, formatPercent, formatPercentValue } from '../utils/format';
import { usePortfolioQuery } from '../hooks/usePortfolio';

export function PortfolioPage() {
  const { portfolios, summary, isLoading } = usePortfolioQuery();

  const [selectedPosition, setSelectedPosition] = useState<{
    token: string;
    supplyApy?: number;
    borrowApy?: number;
    maxLtv: number;
  } | null>(null);

  const totalCollateral = summary.totalSuppliedUsd;
  const totalBorrow = summary.totalBorrowedUsd;

  // If summary.netAprPct is available, use it. Otherwise calculate fallback or default to 0.
  // The summary netAprPct is already computed in usePortfolioQuery using weighted earnings.
  const netAprPct = summary.netAprPct !== undefined ? summary.netAprPct : 0;

  const calculatedHealthFactor = summary.healthFactor;
  // If healthFactor is Infinity (no borrow), risk is 0.
  // Risk = 1 / HF * 100. (HF=1 => 100% Risk. HF=2 => 50% Risk)
  const riskPercentage =
    calculatedHealthFactor > 0 && calculatedHealthFactor !== Infinity
      ? Math.min(Math.max((1 / calculatedHealthFactor) * 100, 0), 100)
      : 0;

  // Flatten positions for the "My Lending" tables if we want to show a consolidated view
  // We include protocol info so we can distinguish or group later if needed.
  const allPositions = useMemo(() => {
    return portfolios.flatMap((p) => p.positions.map((pos) => ({ ...pos, protocol: p.protocol })));
  }, [portfolios]);

  const supplyRows = useMemo(
    () => allPositions.filter((pos) => pos.side === 'supply' && pos.amount > 0),
    [allPositions]
  );
  const borrowRows = useMemo(
    () => allPositions.filter((pos) => pos.side === 'borrow' && pos.amount > 0),
    [allPositions]
  );

  return (
    <>
      <main className={appStyles.content}>
        <section className={styles.strategySection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>My Status</h2>
          </div>

          <div className={styles.statusArea}>
            <div className={styles.statusMain}>
              <div className={styles.metricsGroup}>
                <div className={styles.metricBox}>
                  <span className={styles.metricLabel}>Net Value</span>
                  <span className={styles.metricValue}>
                    ${formatNumber(totalCollateral - totalBorrow)}
                  </span>
                </div>
                <div className={styles.metricBox}>
                  <span className={styles.metricLabel}>Net APY</span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className={styles.metricValue}>{formatPercent(netAprPct)}</span>
                    <span style={{ fontSize: '0.8em', color: '#888' }}>
                      Est. $
                      {formatNumber(
                        portfolios.reduce((sum, p) => sum + (p.totalAnnualNetEarningsUsd || 0), 0)
                      )}{' '}
                      /yr
                    </span>
                  </div>
                </div>
                <div className={styles.healthBox}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      width: '100%',
                      alignItems: 'baseline',
                    }}
                  >
                    <span className={styles.metricLabel}>Health Factor</span>
                    <span className={styles.healthValue}>
                      {calculatedHealthFactor === Infinity
                        ? '∞'
                        : calculatedHealthFactor.toFixed(2)}
                    </span>
                  </div>
                  <div className={styles.healthBar}>
                    {/* Gradient: Green (Low Risk) -> Red (High Risk) */}
                    <div
                      className={styles.healthIndicator}
                      style={{ left: `${riskPercentage}%` }}
                    />
                  </div>
                  <div className={styles.healthLabels}>
                    <span>Safe</span>
                    <span>Risk</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.sectionHeader} style={{ marginTop: '32px' }}>
            <h2 className={styles.sectionTitle}>My Lending</h2>
          </div>

          <div className={styles.lendingTablesContainer}>
            {/* Supplies Panel */}
            <div className={styles.lendingPanel}>
              <div className={styles.panelHeader}>
                <h3 className={styles.panelTitle}>Supplies</h3>
                <div className={styles.headerStats}>
                  <div className={styles.statPill}>
                    <span className={styles.statLabel}>Collateral</span>
                    <span className={styles.statValue}>${formatNumber(totalCollateral)}</span>
                  </div>
                </div>
              </div>

              <div className={styles.tableHeaderRow}>
                <span style={{ flex: 1.2 }}>Asset</span>
                <span style={{ flex: 0.8 }}>APY</span>
                <span style={{ flex: 1 }}>Rewards</span>
                <span style={{ flex: 1, textAlign: 'center' }}>Liq. Price</span>
                <span style={{ flex: 1, textAlign: 'center' }}>Value</span>
                <span style={{ flex: 1.2, textAlign: 'right' }}>Actions</span>
              </div>

              <div className={styles.assetList}>
                {isLoading && <div className={styles.emptyState}>Loading positions...</div>}
                {!isLoading && supplyRows.length === 0 && (
                  <div className={styles.emptyState}>No supplies detected.</div>
                )}
                {supplyRows.map((asset) => (
                  <div key={asset.protocol + asset.coinType + 'supply'} className={styles.assetRow}>
                    <div className={styles.assetInfo} style={{ flex: 1.2 }}>
                      <div className={styles.tokenIconPlaceholder}>{asset.symbol[0]}</div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className={styles.assetAmount}>{formatNumber(asset.amount)}</span>
                        <span className={styles.assetSymbol}>{asset.symbol}</span>
                      </div>
                    </div>
                    <div className={styles.assetApy} style={{ flex: 0.8 }}>
                      {formatPercentValue(asset.apy)}
                    </div>
                    <div style={{ flex: 1, fontSize: '0.85em', color: '#4caf50' }}>
                      {asset.rewards && asset.rewards.length > 0 ? (
                        asset.rewards.map((r, idx) => (
                          <div key={idx}>
                            +{formatNumber(r.amount, 6)} {r.symbol}
                          </div>
                        ))
                      ) : (
                        <span style={{ color: '#888' }}>-</span>
                      )}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                      }}
                    >
                      {asset.estimatedLiquidationPrice
                        ? `$${formatNumber(asset.estimatedLiquidationPrice, 2)}`
                        : '-'}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                      }}
                    >
                      ${formatNumber(asset.valueUsd)}
                    </div>
                    <div className={styles.assetActions} style={{ flex: 1.2 }}>
                      <button
                        className={styles.actionBtnPrimary}
                        onClick={() =>
                          setSelectedPosition({
                            token: asset.symbol,
                            supplyApy: asset.apy,
                            maxLtv: 0.6,
                          })
                        }
                      >
                        Deposit
                      </button>
                      <button className={styles.actionBtnSecondary}>Withdraw</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Borrows Panel */}
            <div className={styles.lendingPanel}>
              <div className={styles.panelHeader}>
                <h3 className={styles.panelTitle}>Borrows</h3>
                <div className={styles.headerStats}>
                  <div className={styles.statPill}>
                    <span className={styles.statLabel}>Debt</span>
                    <span className={styles.statValue}>${formatNumber(totalBorrow)}</span>
                  </div>
                </div>
              </div>

              <div className={styles.tableHeaderRow}>
                <span style={{ flex: 1.5 }}>Asset</span>
                <span style={{ flex: 1 }}>APY</span>
                <span style={{ flex: 1 }}>Rewards</span>
                <span style={{ flex: 1.5, textAlign: 'right' }}>Actions</span>
              </div>

              <div className={styles.assetList}>
                {isLoading && <div className={styles.emptyState}>Loading positions...</div>}
                {!isLoading && borrowRows.length === 0 && (
                  <div className={styles.emptyState}>No borrows detected.</div>
                )}
                {borrowRows.map((asset) => (
                  <div key={asset.protocol + asset.coinType + 'borrow'} className={styles.assetRow}>
                    <div className={styles.assetInfo} style={{ flex: 1.5 }}>
                      <div
                        className={styles.tokenIconPlaceholder}
                        style={{ background: '#f7931a', color: '#fff' }}
                      >
                        {asset.symbol[0]}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className={styles.assetAmount}>
                          {formatNumber(asset.amount)} {asset.symbol}
                        </span>
                        <span className={styles.assetSymbol}>${formatNumber(asset.valueUsd)}</span>
                      </div>
                    </div>
                    <div className={styles.assetApy} style={{ flex: 1 }}>
                      {formatPercentValue(asset.apy)}
                    </div>
                    <div style={{ flex: 1, fontSize: '0.85em', color: '#4caf50' }}>
                      {asset.rewards && asset.rewards.length > 0 ? (
                        asset.rewards.map((r, idx) => (
                          <div key={idx}>
                            +{formatNumber(r.amount, 6)} {r.symbol}
                          </div>
                        ))
                      ) : (
                        <span style={{ color: '#888' }}>-</span>
                      )}
                    </div>
                    <div className={styles.assetActions} style={{ flex: 1.5 }}>
                      <button
                        className={styles.actionBtnOutline}
                        onClick={() =>
                          setSelectedPosition({
                            token: asset.symbol,
                            borrowApy: asset.apy,
                            maxLtv: 0.6,
                            // leverage: 1,
                          })
                        }
                      >
                        Borrow
                      </button>
                      <button className={styles.actionBtnSecondary}>Repay</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {selectedPosition && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedPosition(null)}
          title={`Manage Strategy: ${selectedPosition.token}`}
        >
          <LoopingStrategy
            token={selectedPosition.token}
            supplyApy={selectedPosition.supplyApy || 0}
            borrowApy={selectedPosition.borrowApy || 0}
            maxLtv={selectedPosition.maxLtv}
          />
        </Modal>
      )}
    </>
  );
}
