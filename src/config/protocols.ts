import type { Protocol } from '../domain/types';

export const SUPPORTED_TOKENS = {
  SUI: {
    symbol: 'SUI',
    name: 'Sui',
    coinType: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    decimals: 9,
    icon: 'https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg',
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    decimals: 6,
    icon: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png',
  }
} as const;

export const protocols: Protocol[] = [
  {
    id: 'navi',
    name: 'Navi Protocol',
    logo: '',
    siteUrl: 'https://naviprotocol.io',
    categories: ['lending'],
    chains: ['sui'],
  },
  {
    id: 'suilend',
    name: 'Suilend',
    logo: '',
    siteUrl: 'https://suilend.fi',
    categories: ['lending'],
    chains: ['sui'],
  },
];

export const protocolsById = Object.fromEntries(
  protocols.map((protocol) => [protocol.id, protocol])
);
