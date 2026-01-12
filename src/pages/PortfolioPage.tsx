import { useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { LoopingStrategy } from '../components/LoopingStrategy';
import styles from './PortfolioPage.module.css';
import appStyles from '../App.module.css';
import { formatNumber, formatPercent } from '../utils/format';
import { usePortfolio } from '../hooks/usePortfolio';

export function PortfolioPage() {
  const { rows, summary, isLoading, isError } = usePortfolio();

  const [selectedPosition, setSelectedPosition] = useState<{
    token: string;
    supplyApy?: number;
    borrowApy?: number;
    maxLtv: number;
  } | null>(null);

  const totalCollateral = summary.totalSuppliedUsd;
  const totalBorrow = summary.totalBorrowedUsd;
  const netApy = summary.netAprPct / 100;
  const calculatedHealthFactor = summary.healthFactor;
  const riskPercentage = Math.min(
    Math.max(totalBorrow > 0 ? (1 / calculatedHealthFactor) * 100 : 0, 0),
    100
  );

  const supplyRows = useMemo(() => rows.filter((r) => r.supplied > 0), [rows]);
  const borrowRows = useMemo(() => rows.filter((r) => r.borrowed > 0), [rows]);

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
                    <span className={styles.metricValue}>{formatPercent(netApy * 100)}</span>
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
                        {calculatedHealthFactor.toFixed(2)}
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
                      <span className={styles.statLabel}>Balance</span>
                      <span className={styles.statValue}>${formatNumber(totalCollateral)}</span>
                    </div>
                    <div className={styles.statPill}>
                      <span className={styles.statLabel}>Collateral</span>
                      <span className={styles.statValue}>${formatNumber(totalCollateral)}</span>
                    </div>
                  </div>
                </div>

                <div className={styles.tableHeaderRow}>
                  <span style={{ flex: 1.5 }}>Asset</span>
                  <span style={{ flex: 1 }}>APY</span>
                  <span style={{ flex: 1, textAlign: 'center' }}>Liq. Price</span>
                  <span style={{ flex: 1, textAlign: 'center' }}>Collateral</span>
                  <span style={{ flex: 1.5, textAlign: 'right' }}>Actions</span>
                </div>

                <div className={styles.assetList}>
                  {isLoading && <div className={styles.emptyState}>Loading positions...</div>}
                  {!isLoading && supplyRows.length === 0 && (
                    <div className={styles.emptyState}>No supplies detected.</div>
                  )}
                  {supplyRows.map((asset) => (
                    <div key={asset.coinType} className={styles.assetRow}>
                      <div className={styles.assetInfo} style={{ flex: 1.5 }}>
                        <div className={styles.tokenIconPlaceholder}>{asset.symbol[0]}</div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span className={styles.assetAmount}>{formatNumber(asset.supplied)}</span>
                          <span className={styles.assetSymbol}>{asset.symbol}</span>
                        </div>
                      </div>
                      <div className={styles.assetApy} style={{ flex: 1 }}>
                        {formatPercent(asset.supplyApy * 100)}
                      </div>
                      <div style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                        ${formatNumber(asset.suppliedUsd)}
                      </div>
                      <div className={styles.assetActions} style={{ flex: 1.5 }}>
                        <button
                          className={styles.actionBtnPrimary}
                          onClick={() =>
                            setSelectedPosition({
                              token: asset.symbol,
                              supplyApy: asset.supplyApy,
                              maxLtv: 0.6, // placeholder until per-asset LTV exposed
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
                      <span className={styles.statLabel}>Balance</span>
                      <span className={styles.statValue}>${formatNumber(totalBorrow)}</span>
                    </div>
                    <div className={styles.statPill}>
                      <span className={styles.statLabel}>Power used</span>
                      <span className={styles.statValue}>
                        {(calculatedHealthFactor > 0
                          ? (1 / calculatedHealthFactor) * 100
                          : 0
                        ).toFixed(2)}
                        %
                      </span>
                    </div>
                  </div>
                </div>

                <div className={styles.tableHeaderRow}>
                  <span style={{ flex: 1.5 }}>Asset</span>
                  <span style={{ flex: 1 }}>APY</span>
                  <span style={{ flex: 1.5, textAlign: 'right' }}>Actions</span>
                </div>

                <div className={styles.assetList}>
                  {isLoading && <div className={styles.emptyState}>Loading positions...</div>}
                  {!isLoading && borrowRows.length === 0 && (
                    <div className={styles.emptyState}>No borrows detected.</div>
                  )}
                  {borrowRows.map((asset) => (
                    <div key={asset.coinType} className={styles.assetRow}>
                      <div className={styles.assetInfo} style={{ flex: 1.5 }}>
                        <div
                          className={styles.tokenIconPlaceholder}
                          style={{ background: '#f7931a', color: '#fff' }}
                        >
                          {asset.symbol[0]}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span className={styles.assetAmount}>
                            {formatNumber(asset.borrowed)} {asset.symbol}
                          </span>
                          <span className={styles.assetSymbol}>${formatNumber(asset.borrowedUsd)}</span>
                        </div>
                      </div>
                      <div className={styles.assetApy} style={{ flex: 1 }}>
                        {formatPercent(asset.borrowApy * 100)}
                      </div>
                      <div className={styles.assetActions} style={{ flex: 1.5 }}>
                        <button
                          className={styles.actionBtnOutline}
                          onClick={() =>
                            setSelectedPosition({
                              token: asset.symbol,
                              borrowApy: asset.borrowApy,
                              maxLtv: 0.6,
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
            supplyApy={selectedPosition.supplyApy}
            borrowApy={selectedPosition.borrowApy}
            maxLtv={selectedPosition.maxLtv}
            // Passing initial leverage based on mock data if needed
          />
        </Modal>
      )}
    </>
  );
}
