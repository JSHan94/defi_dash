import { Transaction } from "@mysten/sui/transactions";
import { COIN_TYPES } from "./const";

const DEFAULT_PACKAGE_ID = process.env.SCALLOP_PACKAGE_ID;

const COIN_NAME_TO_TYPE: Record<string, string> = {
  sui: COIN_TYPES.SUI,
  usdc: COIN_TYPES.USDC,
  wusdc: COIN_TYPES.WUSDC,
  wusdt: COIN_TYPES.WUSDT,
  weth: COIN_TYPES.WETH,
  wbtc: COIN_TYPES.WBTC,
  cetus: COIN_TYPES.CETUS,
  afsui: COIN_TYPES.AFSUI,
  hasui: COIN_TYPES.HASUI,
  vsui: COIN_TYPES.CERT,
  sca: COIN_TYPES.SCA,
};

export class ScallopFlashLoanClient {
  packageId: string;
  static DEFAULT_FEE_BPS = 6n; // 0.06%

  constructor(packageId: string = DEFAULT_PACKAGE_ID) {
    if (!packageId) {
      throw new Error(
        "SCALLOP_PACKAGE_ID is not set. Please set a valid Scallop package ID for mainnet."
      );
    }
    this.packageId = packageId;
  }

  private resolveCoinType(name: string) {
    const coinType = COIN_NAME_TO_TYPE[name.toLowerCase()];
    if (!coinType) throw new Error(`Unsupported coin name: ${name}`);
    return coinType;
  }

  borrowFlashLoan(tx: Transaction, amount: bigint, coinName: string) {
    const coinType = this.resolveCoinType(coinName);
    const typeArg = `${this.packageId}::flash_loan::FlashLoanReceipt<${coinType}>`;

    const [loanCoin, receipt] = tx.moveCall({
      target: `${this.packageId}::flash_loan::borrow`,
      arguments: [tx.object("0x6"), tx.pure.u64(amount)],
      typeArguments: [coinType],
    });

    // Hint TypeScript for downstream call sites
    return [loanCoin, { receipt, type: typeArg }] as const;
  }

  repayFlashLoan(
    tx: Transaction,
    loanCoin: any,
    receipt: { receipt: any; type: string },
    coinName: string
  ) {
    const coinType = this.resolveCoinType(coinName);
    tx.moveCall({
      target: `${this.packageId}::flash_loan::repay`,
      arguments: [tx.object("0x6"), loanCoin, receipt.receipt],
      typeArguments: [coinType],
    });
  }

  static calculateFee(amount: bigint, feeBps: bigint = ScallopFlashLoanClient.DEFAULT_FEE_BPS) {
    // ceil(amount * feeBps / 10_000)
    return (amount * feeBps + 9999n) / 10000n;
  }
}
