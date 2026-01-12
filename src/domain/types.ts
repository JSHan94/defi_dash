export type ArbitrageCategoryId = 'lst' | 'liquidity' | 'lending';

export type ChainId = 'sui';

export type SortKey = 'premium' | 'apy' | 'tvl' | 'updatedAt';

export interface ArbitrageCategory {
  id: ArbitrageCategoryId;
  label: string;
  description?: string;
  defaultSort: SortKey;
  supportedChains: ChainId[];
  disabled?: boolean;
  comingSoon?: boolean;
}

export interface Protocol {
  id: string;
  name: string;
  logo: string;
  siteUrl: string;
  categories: ArbitrageCategoryId[];
  chains: ChainId[];
}

export interface ArbitrageItemBase {
  id: string;
  category: ArbitrageCategoryId;
  protocolId: string;
  chain: ChainId;
  tvl: number;
  updatedAt: string;
}

export interface LSTArbitrageItem extends ArbitrageItemBase {
  category: 'lst';
  premium: number;
  token: string;
  marketPrice: number;
  redemptionPrice: number;
  withdrawalDuration: string;
  arbApy: number;
}

export interface LiquidityArbitrageItem extends ArbitrageItemBase {
  category: 'liquidity';
  premium: number;
}

export interface LendingArbitrageItem extends ArbitrageItemBase {
  category: 'lending';
  supplyApy: number;
  borrowApy: number;
  collateralRatio: number;
  token: string;
}

export type ArbitrageItem = LSTArbitrageItem | LiquidityArbitrageItem | LendingArbitrageItem;

export interface PositionSummary {
  totalDeposits: number;
  totalBorrows: number;
  netExposure: number;
  healthFactor: number;
  updatedAt: string;
}

export interface UserPosition {
  category: ArbitrageCategoryId;
  protocolId: string;
  chain: ChainId;
  size: number;
  rate: number;
  collateral: number;
  debt: number;
  relatedRowId: string;
}
