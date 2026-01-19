import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConnectButton } from '@mysten/dapp-kit';
import styles from './App.module.css';

import { ChainSelect, type ChainOption } from './components/ChainSelect';
import { Navigation } from './components/Navigation';
import { StrategyPage } from './pages/StrategyPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { DevPage } from './pages/DevPage';
import { chainIcons } from './assets/chains';

function App() {
  const chainOptions: ChainOption[] = [{ id: 'sui', label: 'Sui', icon: chainIcons.sui }];

  return (
    <BrowserRouter>
      <div className={styles.app}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.titleGroup}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <h1 className={styles.title}>DeFi Dashboard</h1>
                <Navigation />
              </div>
            </div>
            <div className={styles.headerActions}>
              <ChainSelect options={chainOptions} value="sui" onChange={() => {}} />
              <ConnectButton className={styles.connectButton} />
            </div>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<Navigate to="/strategy" replace />} />
          <Route path="/strategy" element={<StrategyPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/dev" element={<DevPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
