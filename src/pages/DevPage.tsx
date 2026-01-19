import { useState, useCallback } from 'react';
import styles from './DevPage.module.css';
import appStyles from '../App.module.css';
import { useDefiDash, LendingProtocol } from '../hooks/useDefiDash';

type ProtocolId = 'navi' | 'suilend';
type TabId = 'open' | 'close';
type ExecutionMode = 'dryrun' | 'execute';

interface LogEntry {
  type: 'info' | 'success' | 'error';
  message: string;
}

const COIN_OPTIONS = [
  { symbol: 'LBTC', name: 'Lombard BTC' },
  { symbol: 'SUI', name: 'Sui' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'USDC', name: 'USD Coin' },
];

export function DevPage() {
  const [protocol, setProtocol] = useState<ProtocolId>('navi');
  const [activeTab, setActiveTab] = useState<TabId>('open');
  const [coinType, setCoinType] = useState('LBTC');
  const [depositAmount, setDepositAmount] = useState('0.00001');
  const [leverage, setLeverage] = useState(2.0);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('dryrun');
  const [isExecuting, setIsExecuting] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const { isConnected, address, openLeverage, closeLeverage, dryRunLeverage } = useDefiDash();

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs((prev) => [...prev, { type, message }]);
  }, []);

  const clearLogs = () => setLogs([]);

  const lendingProtocol = protocol === 'navi' ? LendingProtocol.Navi : LendingProtocol.Suilend;

  const handleExecute = async () => {
    if (!isConnected) {
      addLog('error', '❌ Wallet not connected');
      return;
    }

    setIsExecuting(true);
    clearLogs();

    try {
      addLog('info', '🧪 DefiDash SDK Test');
      addLog('info', `Wallet: ${address?.slice(0, 10)}...${address?.slice(-6)}`);
      addLog('info', `Protocol: ${protocol.toUpperCase()}`);
      addLog('info', `Mode: ${executionMode}`);
      addLog('info', '');

      if (activeTab === 'open') {
        const params = {
          protocol: lendingProtocol,
          depositAsset: coinType,
          depositAmount,
          multiplier: leverage,
        };

        addLog('info', `Coin: ${coinType}, Amount: ${depositAmount}, Leverage: ${leverage}x`);
        addLog('info', '');

        if (executionMode === 'dryrun') {
          addLog('info', '⏳ Running simulation...');
          const result = await dryRunLeverage(params);

          if (result.success) {
            addLog('success', '✅ Dry run passed!');
          } else {
            addLog('error', `❌ Would fail: ${result.error}`);
          }
        } else {
          addLog('info', '⏳ Executing transaction...');
          const result = await openLeverage(params);
          addLog('success', `✅ TX: ${result.digest}`);
        }
      } else {
        addLog('info', '⏳ Closing position...');

        if (executionMode === 'dryrun') {
          addLog('info', 'Dry run for deleverage - checking position...');
          // For deleverage dry run, we'd need buildDeleverageTransaction + dryRun
          // Simplified for now
          addLog('success', '✅ Deleverage simulation not implemented yet');
        } else {
          const result = await closeLeverage(lendingProtocol);
          addLog('success', `✅ Position closed: ${result.digest}`);
        }
      }

      addLog('info', '');
      addLog('success', '🎉 Complete!');
    } catch (error) {
      addLog('error', `❌ ${error instanceof Error ? error.message : 'Error'}`);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <main className={appStyles.content}>
      <section className={styles.container}>
        <div className={styles.header}>
          <span className={styles.headerIcon}>🧪</span>
          <h2 className={styles.title}>SDK Integration Test</h2>
        </div>
        <p className={styles.description}>
          Test leverage/deleverage strategies using DefiDash SDK.
          {!isConnected && <span style={{ color: '#ffaa00' }}> Connect wallet first.</span>}
        </p>

        {isConnected && (
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(74, 222, 128, 0.1)',
              border: '1px solid rgba(74, 222, 128, 0.3)',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '13px',
              color: '#4ade80',
            }}
          >
            ✓ Connected: {address?.slice(0, 10)}...{address?.slice(-6)}
          </div>
        )}

        <div className={styles.protocolButtons}>
          <button
            type="button"
            onClick={() => setProtocol('navi')}
            className={`${styles.protocolBtn} ${protocol === 'navi' ? styles.protocolBtnActive : ''}`}
          >
            Navi Protocol
          </button>
          <button
            type="button"
            onClick={() => setProtocol('suilend')}
            className={`${styles.protocolBtn} ${protocol === 'suilend' ? styles.protocolBtnActive : ''}`}
          >
            Suilend
          </button>
        </div>

        <div className={styles.card}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'open' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('open')}
            >
              Open Position
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'close' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('close')}
            >
              Close Position
            </button>
          </div>

          {activeTab === 'open' && (
            <>
              <div className={styles.section}>
                <label className={styles.label}>Deposit Coin</label>
                <select
                  className={styles.select}
                  value={coinType}
                  onChange={(e) => setCoinType(e.target.value)}
                >
                  {COIN_OPTIONS.map((coin) => (
                    <option key={coin.symbol} value={coin.symbol}>
                      {coin.symbol} - {coin.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.section}>
                <label className={styles.label}>Amount</label>
                <input
                  type="text"
                  className={styles.input}
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.001"
                />
              </div>

              <div className={styles.section}>
                <div className={styles.sliderHeader}>
                  <label className={styles.label}>Leverage</label>
                  <span className={styles.leverageValue}>{leverage.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="1.1"
                  max="5.0"
                  step="0.1"
                  value={leverage}
                  onChange={(e) => setLeverage(parseFloat(e.target.value))}
                  className={styles.slider}
                />
              </div>
            </>
          )}

          {activeTab === 'close' && (
            <div className={styles.section}>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Close your leveraged position on {protocol.toUpperCase()}.
              </p>
            </div>
          )}

          <div className={styles.section}>
            <label className={styles.label}>Mode</label>
            <div className={styles.modeToggle}>
              <label
                className={`${styles.modeOption} ${executionMode === 'dryrun' ? styles.modeOptionActive : ''}`}
              >
                <input
                  type="radio"
                  name="mode"
                  checked={executionMode === 'dryrun'}
                  onChange={() => setExecutionMode('dryrun')}
                />
                Dry Run
              </label>
              <label
                className={`${styles.modeOption} ${executionMode === 'execute' ? styles.modeOptionActive : ''}`}
              >
                <input
                  type="radio"
                  name="mode"
                  checked={executionMode === 'execute'}
                  onChange={() => setExecutionMode('execute')}
                />
                Execute
              </label>
            </div>
          </div>

          {executionMode === 'execute' && (
            <div className={styles.warningBox}>
              <span>⚠️ Real transaction will be submitted.</span>
            </div>
          )}

          <button
            type="button"
            className={styles.actionButton}
            onClick={handleExecute}
            disabled={isExecuting || !isConnected}
          >
            {!isConnected ? 'Connect Wallet' : isExecuting ? 'Running...' : 'Execute'}
          </button>
        </div>

        <div className={styles.logPanel}>
          <div className={styles.logHeader}>
            <span>Log</span>
            {logs.length > 0 && (
              <button type="button" className={styles.clearBtn} onClick={clearLogs}>
                Clear
              </button>
            )}
          </div>
          <div className={styles.logContent}>
            {logs.length === 0 ? (
              <span className={styles.logEmpty}>No logs yet.</span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={styles.logLine}>
                  <span className={styles.logPrefix}>&gt;</span>
                  <span
                    className={
                      log.type === 'success'
                        ? styles.logSuccess
                        : log.type === 'error'
                          ? styles.logError
                          : styles.logText
                    }
                  >
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
