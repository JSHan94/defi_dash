import { useCallback, useState } from "react"
import {
	useCurrentAccount,
	useSignAndExecuteTransaction,
	useSuiClient,
} from "@mysten/dapp-kit"
import { Transaction } from "@mysten/sui/transactions"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
	depositCoinPTB,
	borrowCoinPTB,
	withdrawCoinPTB,
	repayCoinPTB,
	getPools,
	getLendingState,
	getHealthFactor,
	getCoins,
	flashloanPTB,
	repayFlashLoanPTB,
	getAllFlashLoanAssets,
	updateOraclePricesPTB,
	getPriceFeeds,
	normalizeCoinType,
} from "@naviprotocol/lending"
import { formatAmount, parseAmount, getTokenByCoinType } from "../config"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTransaction = any

export interface PoolData {
	symbol: string
	coinType: string
	supplyApy: number
	borrowApy: number
	totalSupply: string
	totalBorrow: string
	availableLiquidity: string
	decimals: number
	price: number
	liquidationThreshold: number
}

export interface UserPosition {
	symbol: string
	coinType: string
	supplied: string
	borrowed: string
	suppliedRaw: bigint
	borrowedRaw: bigint
}

export interface CoinBalance {
	coinObjectId: string
	balance: string
	balanceRaw: bigint
}

function normalizeApy(raw: unknown): number {
	const val =
		typeof raw === "number"
			? raw
			: typeof raw === "string"
				? parseFloat(raw)
				: 0
	if (Number.isNaN(val)) return 0
	// If value looks like a percent or bps (e.g., 8000 = 80.00%), scale down.
	return val > 1 ? val / 10_000 : val
}

export function usePools() {
	return useQuery({
		queryKey: ["navi", "pools"],
		queryFn: async (): Promise<PoolData[]> => {
			const pools = await getPools({ env: "prod" })

			console.log("Raw pools response:", pools)

			// Handle both array and object formats
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const poolsArray: any[] = Array.isArray(pools)
				? pools
				: Object.values(pools)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return poolsArray.map((pool: any) => {
				const coinType = pool.coinType ?? pool.suiCoinType ?? ""
				const token = getTokenByCoinType(coinType)
				const decimals = pool.token?.decimals ?? token?.decimals ?? 9
				const symbol =
					pool.token?.symbol ??
					token?.symbol ??
					coinType.split("::").pop() ??
					"UNKNOWN"

				// APY values - the SDK may return these as numbers or need calculation from rates
				// currentSupplyRate/currentBorrowRate are raw rates, need to convert to APY
				const supplyApy =
					pool.supplyApy ?? pool.supplyIncentiveApyInfo?.apy ?? 0
				const borrowApy =
					pool.borrowApy ?? pool.borrowIncentiveApyInfo?.apy ?? 0

				// Get totals - these may be formatted strings or numbers, not BigInt
				const formatValue = (val: unknown): string => {
					if (val === undefined || val === null) return "0"
					if (typeof val === "number") return val.toFixed(4)
					if (typeof val === "string") {
						// Check if it's a decimal number string
						if (val.includes(".")) return parseFloat(val).toFixed(4)
						// Otherwise it might be a large integer string
						try {
							return formatAmount(BigInt(val), decimals)
						} catch {
							return val
						}
					}
					return String(val)
				}

				return {
					symbol,
					coinType,
					supplyApy: normalizeApy(supplyApy),
					borrowApy: normalizeApy(borrowApy),
					totalSupply: formatValue(
						pool.totalSupply ?? pool.totalSupplyAmount
					),
					totalBorrow: formatValue(
						pool.totalBorrow ?? pool.borrowedAmount
					),
					availableLiquidity: formatValue(
						pool.leftSupply ??
							pool.availableBorrow ??
							pool.leftBorrowAmount
					),
					decimals,
					price: parseFloat(pool.oracle?.price ?? pool.price ?? "0"),
					liquidationThreshold: parseFloat(
						pool.liquidationFactor?.threshold ?? "0.8"
					),
				}
			})
		},
		staleTime: 30000,
	})
}

export function useUserPositions() {
	const account = useCurrentAccount()

	return useQuery({
		queryKey: ["navi", "positions", account?.address],
		queryFn: async (): Promise<UserPosition[]> => {
			if (!account?.address) return []

			const states = await getLendingState(account.address, {
				env: "prod",
			})

			console.log("Raw lending states:", states)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return states.map((state: any, index: number) => {
				// coinType can be at state.coinType, state.pool.coinType, or derived from assetId
				const coinType = state.coinType ?? state.pool?.coinType ?? ""
				const token = getTokenByCoinType(coinType)
				const symbol =
					state.symbol ??
					state.pool?.symbol ??
					token?.symbol ??
					coinType.split("::").pop() ??
					"UNKNOWN"

				// Get decimals from pool or token config (default to 9 for SUI-based tokens)
				const decimals =
					state.pool?.token?.decimals ?? token?.decimals ?? 9

				// SDK returns balances as raw integers in smallest unit
				const supplyBalanceRaw = state.supplyBalance ?? 0
				const borrowBalanceRaw = state.borrowBalance ?? 0

				// Convert raw value to BigInt
				const toRaw = (val: unknown): bigint => {
					if (val === undefined || val === null) return BigInt(0)
					if (typeof val === "bigint") return val
					if (typeof val === "number") return BigInt(Math.floor(val))
					if (typeof val === "string") {
						// If it contains a decimal, it's already formatted
						if (val.includes(".")) {
							const num = parseFloat(val)
							return BigInt(
								Math.floor(num * Math.pow(10, decimals))
							)
						}
						try {
							return BigInt(val)
						} catch {
							return BigInt(0)
						}
					}
					return BigInt(0)
				}

				const suppliedRaw = toRaw(supplyBalanceRaw)
				const borrowedRaw = toRaw(borrowBalanceRaw)

				return {
					symbol,
					coinType: coinType || `unknown-${index}`,
					supplied: formatAmount(suppliedRaw, decimals),
					borrowed: formatAmount(borrowedRaw, decimals),
					suppliedRaw,
					borrowedRaw,
				}
			})
		},
		enabled: !!account?.address,
		staleTime: 10000,
	})
}

export function useHealthFactor() {
	const account = useCurrentAccount()

	return useQuery({
		queryKey: ["navi", "healthFactor", account?.address],
		queryFn: async (): Promise<number> => {
			if (!account?.address) return Infinity
			return await getHealthFactor(account.address, { env: "prod" })
		},
		enabled: !!account?.address,
		staleTime: 10000,
	})
}

export interface MaxBorrowData {
	maxBorrowAmount: string
	maxBorrowValue: number
	totalCollateralValue: number
	totalBorrowValue: number
	availableBorrowValue: number
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useMaxBorrow(coinType: string, _decimals: number = 9) {
	const account = useCurrentAccount()

	return useQuery({
		queryKey: ["navi", "maxBorrow", account?.address, coinType],
		queryFn: async (): Promise<MaxBorrowData> => {
			if (!account?.address || !coinType) {
				return {
					maxBorrowAmount: "0",
					maxBorrowValue: 0,
					totalCollateralValue: 0,
					totalBorrowValue: 0,
					availableBorrowValue: 0,
				}
			}

			// Get all pools with oracle prices and collateral factors
			const pools = await getPools({ env: "prod" })
			const states = await getLendingState(account.address, {
				env: "prod",
			})

			console.log("Pools for max borrow calc:", pools)
			console.log("States for max borrow calc:", states)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const poolsArray: any[] = Array.isArray(pools)
				? pools
				: Object.values(pools)

			// Create a map of coinType -> pool data
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const poolMap = new Map<string, any>()
			for (const pool of poolsArray) {
				const ct = pool.coinType ?? pool.suiCoinType ?? ""
				if (ct) poolMap.set(ct, pool)
			}

			let totalCollateralValue = 0
			let totalBorrowValue = 0

			// Calculate total collateral and borrow values
			for (const state of states) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const stateAny = state as any
				const stateCoinType =
					stateAny.coinType ?? stateAny.pool?.coinType ?? ""
				const pool = poolMap.get(stateCoinType)
				if (!pool) continue

				// Get oracle price (normalized to USD or base unit)
				const oraclePrice = parseFloat(
					pool.oracle?.price ?? pool.price ?? "1"
				)
				const tokenDecimals = pool.token?.decimals ?? 9

				// Get LTV (Loan-to-Value) - this is how much you can borrow against collateral
				// liquidationFactor.threshold is the liquidation threshold (e.g., 0.8 = 80%)
				// LTV is typically lower than liquidation threshold (e.g., 0.75 = 75%)
				// We derive LTV from threshold - a safety margin
				const liquidationThreshold = parseFloat(
					pool.liquidationFactor?.threshold ?? "0.8"
				)

				// LTV is typically 5% lower than liquidation threshold
				// e.g., if threshold is 0.8 (80%), LTV is around 0.75 (75%)
				const ltv = Math.min(
					liquidationThreshold - 0.05,
					liquidationThreshold * 0.9375
				)

				console.log(
					`Pool ${pool.token?.symbol}: threshold=${liquidationThreshold}, derived LTV=${ltv}`
				)

				// Get supply and borrow balances (raw values)
				const supplyRaw = parseFloat(stateAny.supplyBalance ?? "0")
				const borrowRaw = parseFloat(stateAny.borrowBalance ?? "0")

				// Convert to actual amounts
				const supplyAmount = supplyRaw / Math.pow(10, tokenDecimals)
				const borrowAmount = borrowRaw / Math.pow(10, tokenDecimals)

				// Calculate values
				const supplyValue = supplyAmount * oraclePrice * ltv
				const borrowValue = borrowAmount * oraclePrice

				totalCollateralValue += supplyValue
				totalBorrowValue += borrowValue

				console.log(
					`Position: supply=${supplyAmount}, borrow=${borrowAmount}, price=${oraclePrice}, ltv=${ltv}`
				)
				console.log(
					`Values: collateralValue=${supplyValue}, borrowValue=${borrowValue}`
				)
			}

			// Available borrow value (in USD or base unit)
			const availableBorrowValue = Math.max(
				0,
				totalCollateralValue - totalBorrowValue
			)

			// Get the target token's pool to convert value to amount
			const targetPool = poolMap.get(coinType)
			const targetPrice = parseFloat(
				targetPool?.oracle?.price ?? targetPool?.price ?? "1"
			)

			console.log(
				`Max Borrow Calc: totalCollateral=${totalCollateralValue}, totalBorrow=${totalBorrowValue}, available=${availableBorrowValue}, targetPrice=${targetPrice}`
			)

			// Max borrow amount in target token
			// Apply 99% safety buffer to account for interest accrual and rounding
			const SAFETY_BUFFER = 0.99
			const maxBorrowAmount =
				targetPrice > 0
					? (availableBorrowValue / targetPrice) * SAFETY_BUFFER
					: 0

			console.log(
				`Max Borrow Amount (before buffer): ${
					availableBorrowValue / targetPrice
				}, (after buffer): ${maxBorrowAmount}`
			)

			// Format the amount
			const formattedAmount =
				maxBorrowAmount > 0
					? maxBorrowAmount.toFixed(6).replace(/\.?0+$/, "")
					: "0"

			return {
				maxBorrowAmount: formattedAmount,
				maxBorrowValue: availableBorrowValue,
				totalCollateralValue,
				totalBorrowValue,
				availableBorrowValue,
			}
		},
		enabled: !!account?.address && !!coinType,
		staleTime: 10000,
	})
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useMaxWithdraw(coinType: string, _decimals: number = 9) {
	const account = useCurrentAccount()

	return useQuery({
		queryKey: ["navi", "maxWithdraw", account?.address, coinType],
		queryFn: async (): Promise<string> => {
			if (!account?.address || !coinType) return "0"

			const pools = await getPools({ env: "prod" })
			const states = await getLendingState(account.address, {
				env: "prod",
			})

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const poolsArray: any[] = Array.isArray(pools)
				? pools
				: Object.values(pools)

			// Create pool map
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const poolMap = new Map<string, any>()
			for (const pool of poolsArray) {
				const ct = pool.coinType ?? pool.suiCoinType ?? ""
				if (ct) poolMap.set(ct, pool)
			}

			let totalCollateralValue = 0
			let totalBorrowValue = 0
			let targetSupplyAmount = 0
			let targetCollateralFactor = 0.75
			let targetPrice = 1

			for (const state of states) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const stateAny = state as any
				const stateCoinType =
					stateAny.coinType ?? stateAny.pool?.coinType ?? ""
				const pool = poolMap.get(stateCoinType)
				if (!pool) continue

				const oraclePrice = parseFloat(
					pool.oracle?.price ?? pool.price ?? "1"
				)
				const tokenDecimals = pool.token?.decimals ?? 9
				const liquidationThreshold = parseFloat(
					pool.liquidationFactor?.threshold ?? "0.8"
				)
				const collateralFactor = Math.min(
					liquidationThreshold - 0.05,
					liquidationThreshold * 0.9375
				)

				const supplyRaw = parseFloat(stateAny.supplyBalance ?? "0")
				const borrowRaw = parseFloat(stateAny.borrowBalance ?? "0")

				const supplyAmount = supplyRaw / Math.pow(10, tokenDecimals)
				const borrowAmount = borrowRaw / Math.pow(10, tokenDecimals)

				const supplyValue =
					supplyAmount * oraclePrice * collateralFactor
				const borrowValue = borrowAmount * oraclePrice

				totalCollateralValue += supplyValue
				totalBorrowValue += borrowValue

				if (stateCoinType === coinType) {
					targetSupplyAmount = supplyAmount
					targetCollateralFactor = collateralFactor
					targetPrice = oraclePrice
				}
			}

			// If no borrows, can withdraw all (with safety buffer)
			if (totalBorrowValue === 0) {
				const SAFETY_BUFFER = 0.999
				const maxAmount = targetSupplyAmount * SAFETY_BUFFER
				return maxAmount > 0
					? maxAmount.toFixed(6).replace(/\.?0+$/, "")
					: "0"
			}

			// With borrows, calculate max withdraw while keeping HF >= 1
			// Required collateral = totalBorrowValue
			// Excess collateral = totalCollateralValue - totalBorrowValue
			// Max withdraw value = excess collateral (with safety buffer)
			const excessCollateralValue =
				totalCollateralValue - totalBorrowValue
			const SAFETY_BUFFER = 0.95 // 95% to be safe

			if (excessCollateralValue <= 0) return "0"

			// Convert value to amount for target token
			const maxWithdrawValue = excessCollateralValue * SAFETY_BUFFER
			const maxWithdrawAmount =
				maxWithdrawValue / (targetPrice * targetCollateralFactor)

			// Can't withdraw more than supplied
			const finalAmount = Math.min(
				maxWithdrawAmount,
				targetSupplyAmount * 0.999
			)

			return finalAmount > 0
				? finalAmount.toFixed(6).replace(/\.?0+$/, "")
				: "0"
		},
		enabled: !!account?.address && !!coinType,
		staleTime: 10000,
	})
}

export function useCoinBalance(coinType: string, decimals: number = 9) {
	const account = useCurrentAccount()
	const client = useSuiClient()

	return useQuery({
		queryKey: ["navi", "coinBalance", account?.address, coinType],
		queryFn: async (): Promise<{
			balance: string
			balanceRaw: bigint
			coins: CoinBalance[]
		}> => {
			if (!account?.address)
				return { balance: "0", balanceRaw: BigInt(0), coins: [] }

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const coins = await getCoins(account.address, {
				coinType,
				client: client as any,
			})

			console.log(`Coins for ${coinType}:`, coins)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const totalBalance = coins.reduce(
				(sum: bigint, coin: any) => sum + BigInt(coin.balance ?? 0),
				BigInt(0)
			)

			return {
				balance: formatAmount(totalBalance, decimals),
				balanceRaw: totalBalance,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				coins: coins.map((coin: any) => ({
					coinObjectId: coin.coinObjectId,
					balance: formatAmount(BigInt(coin.balance ?? 0), decimals),
					balanceRaw: BigInt(coin.balance ?? 0),
				})),
			}
		},
		enabled: !!account?.address && !!coinType,
		staleTime: 10000,
	})
}

interface MutationParams {
	coinType: string
	decimals: number
	amount: string
	symbol?: string
}

export function useDeposit() {
	const account = useCurrentAccount()
	const client = useSuiClient()
	const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			coinType,
			decimals,
			amount,
			symbol,
		}: MutationParams) => {
			if (!account?.address) throw new Error("Wallet not connected")

			const amountInSmallestUnit = parseAmount(amount, decimals)

			// Get user's coins
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const coins = await getCoins(account.address, {
				coinType,
				client: client as any,
			})

			if (coins.length === 0) {
				throw new Error(`No ${symbol ?? "token"} coins found in wallet`)
			}

			const txb = new Transaction() as AnyTransaction

			// Select coin to deposit
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const coinToDeposit = txb.splitCoins(
				txb.object((coins[0] as any).coinObjectId),
				[amountInSmallestUnit]
			)[0]

			// Build deposit transaction
			await depositCoinPTB(txb, coinType, coinToDeposit, {
				amount: Number(amountInSmallestUnit),
				env: "prod",
			})

			// Execute transaction
			const result = await signAndExecute({
				transaction: txb,
			})

			return result.digest
		},
		onSuccess: () => {
			queryClient.removeQueries({ queryKey: ["navi"] })
		},
	})
}

export function useBorrow() {
	const account = useCurrentAccount()
	const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({ coinType, decimals, amount }: MutationParams) => {
			if (!account?.address) throw new Error("Wallet not connected")

			const amountInSmallestUnit = parseAmount(amount, decimals)

			const txb = new Transaction() as AnyTransaction

			// Build borrow transaction
			const borrowedCoin = await borrowCoinPTB(
				txb,
				coinType,
				Number(amountInSmallestUnit),
				{ env: "prod" }
			)

			// Transfer borrowed coin to user
			txb.transferObjects([borrowedCoin], account.address)

			// Execute transaction
			const result = await signAndExecute({
				transaction: txb,
			})

			return result.digest
		},
		onSuccess: () => {
			queryClient.removeQueries({ queryKey: ["navi"] })
		},
	})
}

export function useWithdraw() {
	const account = useCurrentAccount()
	const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({ coinType, decimals, amount }: MutationParams) => {
			if (!account?.address) throw new Error("Wallet not connected")

			const amountInSmallestUnit = parseAmount(amount, decimals)

			const txb = new Transaction() as AnyTransaction

			// Build withdraw transaction
			const withdrawnCoin = await withdrawCoinPTB(
				txb,
				coinType,
				Number(amountInSmallestUnit),
				{ env: "prod" }
			)

			// Transfer withdrawn coin to user
			txb.transferObjects([withdrawnCoin], account.address)

			// Execute transaction
			const result = await signAndExecute({
				transaction: txb,
			})

			return result.digest
		},
		onSuccess: () => {
			queryClient.removeQueries({ queryKey: ["navi"] })
		},
	})
}

export function useRepay() {
	const account = useCurrentAccount()
	const client = useSuiClient()
	const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			coinType,
			decimals,
			amount,
			symbol,
		}: MutationParams) => {
			if (!account?.address) throw new Error("Wallet not connected")

			const amountInSmallestUnit = parseAmount(amount, decimals)

			// Get user's coins
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const coins = await getCoins(account.address, {
				coinType,
				client: client as any,
			})

			if (coins.length === 0) {
				throw new Error(`No ${symbol ?? "token"} coins found in wallet`)
			}

			const txb = new Transaction() as AnyTransaction

			// Select coin to repay
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const coinToRepay = txb.splitCoins(
				txb.object((coins[0] as any).coinObjectId),
				[amountInSmallestUnit]
			)[0]

			// Build repay transaction
			await repayCoinPTB(txb, coinType, coinToRepay, {
				amount: Number(amountInSmallestUnit),
				env: "prod",
			})

			// Execute transaction
			const result = await signAndExecute({
				transaction: txb,
			})

			return result.digest
		},
		onSuccess: () => {
			queryClient.removeQueries({ queryKey: ["navi"] })
		},
	})
}

export interface LeverageInfo {
	maxLeverage: number
	ltv: number
	liquidationThreshold: number
}

export function useMaxLeverage(coinType: string) {
	return useQuery({
		queryKey: ["navi", "maxLeverage", coinType],
		queryFn: async (): Promise<LeverageInfo> => {
			const pools = await getPools({ env: "prod" })
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const poolsArray: any[] = Array.isArray(pools)
				? pools
				: Object.values(pools)

			const pool = poolsArray.find((p) => {
				const ct = p.coinType ?? p.suiCoinType ?? ""
				return (
					normalizeCoinType(ct) === normalizeCoinType(coinType) ||
					normalizeCoinType(p.suiCoinType ?? "") ===
						normalizeCoinType(coinType)
				)
			})

			if (!pool) {
				return { maxLeverage: 1, ltv: 0, liquidationThreshold: 0 }
			}

			const liquidationThreshold = parseFloat(
				pool.liquidationFactor?.threshold ?? "0.8"
			)
			const ltv = Math.min(
				liquidationThreshold - 0.05,
				liquidationThreshold * 0.9375
			)

			// Max leverage = 1 / (1 - LTV)
			// For LTV = 0.75, max leverage = 1 / 0.25 = 4x
			// We apply a safety margin of 95%
			const theoreticalMaxLeverage = 1 / (1 - ltv)
			const maxLeverage = theoreticalMaxLeverage * 0.95

			return {
				maxLeverage: Math.floor(maxLeverage * 10) / 10, // Round down to 1 decimal
				ltv,
				liquidationThreshold,
			}
		},
		enabled: !!coinType,
		staleTime: 60000,
	})
}

interface LeveragedDepositParams {
	coinType: string
	decimals: number
	initialAmount: string
	leverage: number
	symbol?: string
}

// Step 1: Initial deposit only
export function useLeveragedDepositStep1() {
	const account = useCurrentAccount()
	const client = useSuiClient()
	const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			coinType,
			decimals,
			initialAmount,
			symbol,
		}: Omit<LeveragedDepositParams, "leverage">) => {
			if (!account?.address) throw new Error("Wallet not connected")

			const initialAmountRaw = parseAmount(initialAmount, decimals)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const coins = await getCoins(account.address, {
				coinType,
				client: client as any,
			})

			if (coins.length === 0) {
				throw new Error(`No ${symbol ?? "token"} coins found in wallet`)
			}

			const txb = new Transaction() as AnyTransaction

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const depositCoin = txb.splitCoins(
				txb.object((coins[0] as any).coinObjectId),
				[initialAmountRaw]
			)[0]

			await depositCoinPTB(txb, coinType, depositCoin, {
				amount: Number(initialAmountRaw),
				env: "prod",
			})

			const result = await signAndExecute({
				transaction: txb,
			})

			return result.digest
		},
		onSuccess: () => {
			queryClient.removeQueries({ queryKey: ["navi"] })
		},
	})
}

// Step 2: Leverage loop (borrow and redeposit) - requires existing collateral
export function useLeveragedDepositStep2() {
	const account = useCurrentAccount()
	const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			coinType,
			decimals,
			targetLeverage,
			currentSupplied,
		}: {
			coinType: string
			decimals: number
			targetLeverage: number
			currentSupplied: string
		}) => {
			if (!account?.address) throw new Error("Wallet not connected")

			const currentSuppliedRaw = parseAmount(currentSupplied, decimals)
			const targetTotal = Number(currentSupplied) * targetLeverage

			console.log("Leverage step 2:", {
				currentSupplied,
				targetLeverage,
				targetTotal,
			})

			const txb = new Transaction() as AnyTransaction

			// LTV factor with safety margin
			const LTV = 0.72
			const maxLoops = 8

			let totalBorrowed = BigInt(0)
			let lastBorrowAmount = BigInt(
				Math.floor(Number(currentSuppliedRaw) * LTV * 0.95)
			)

			for (let i = 0; i < maxLoops; i++) {
				if (lastBorrowAmount <= BigInt(1000)) break // Minimum threshold

				const currentTotal =
					Number(currentSuppliedRaw) +
					Number(totalBorrowed) +
					Number(lastBorrowAmount)
				const currentLeverage =
					currentTotal / Number(currentSuppliedRaw)

				if (currentLeverage >= targetLeverage * 0.95) {
					console.log(
						`Target leverage reached at loop ${
							i + 1
						}: ${currentLeverage.toFixed(2)}x`
					)
					// Final borrow to reach target
					const finalBorrow = BigInt(
						Math.floor(
							(targetTotal -
								currentTotal +
								Number(lastBorrowAmount)) *
								0.95
						)
					)
					if (
						finalBorrow > BigInt(0) &&
						finalBorrow < lastBorrowAmount
					) {
						lastBorrowAmount = finalBorrow
					}
				}

				console.log(
					`Loop ${i + 1}: borrowing ${formatAmount(
						lastBorrowAmount,
						decimals
					)}`
				)

				// Borrow
				const borrowedCoin = await borrowCoinPTB(
					txb,
					coinType,
					Number(lastBorrowAmount),
					{ env: "prod" }
				)

				// Deposit borrowed amount
				await depositCoinPTB(txb, coinType, borrowedCoin, {
					amount: Number(lastBorrowAmount),
					env: "prod",
				})

				totalBorrowed += lastBorrowAmount

				// Next borrow amount (decreasing)
				lastBorrowAmount = BigInt(
					Math.floor(Number(lastBorrowAmount) * LTV * 0.95)
				)

				// Check if we've reached target
				const newLeverage =
					(Number(currentSuppliedRaw) + Number(totalBorrowed)) /
					Number(currentSuppliedRaw)
				if (newLeverage >= targetLeverage * 0.98) {
					console.log(`Final leverage: ${newLeverage.toFixed(2)}x`)
					break
				}
			}

			const result = await signAndExecute({
				transaction: txb,
			})

			return result.digest
		},
		onSuccess: () => {
			queryClient.removeQueries({ queryKey: ["navi"] })
		},
	})
}

export function useDepositAndBorrow() {
	const account = useCurrentAccount()
	const client = useSuiClient()
	const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			coinType,
			decimals,
			depositAmount,
			borrowAmount,
			symbol,
		}: {
			coinType: string
			decimals: number
			depositAmount: string // Amount to deposit
			borrowAmount: string // Amount to borrow
			symbol?: string
		}) => {
			if (!account?.address) throw new Error("Wallet not connected")

			const depositAmountRaw = parseAmount(depositAmount, decimals)
			const borrowAmountRaw = parseAmount(borrowAmount, decimals)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const coins = await getCoins(account.address, {
				coinType,
				client: client as any,
			})

			if (coins.length === 0) {
				throw new Error(`No ${symbol ?? "token"} coins found in wallet`)
			}

			const txb = new Transaction() as AnyTransaction

			// 1. Prepare Coin for Deposit
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const coinToDeposit = txb.splitCoins(
				txb.object((coins[0] as any).coinObjectId),
				[depositAmountRaw]
			)[0]

			// 2. Deposit
			await depositCoinPTB(txb, coinType, coinToDeposit, {
				amount: Number(depositAmountRaw),
				env: "prod",
			})

			// 3. Borrow
			const borrowedCoin = await borrowCoinPTB(
				txb,
				coinType,
				Number(borrowAmountRaw),
				{ env: "prod" }
			)

			// 4. Transfer borrowed coin to user
			txb.transferObjects([borrowedCoin], account.address)

			// Execute transaction
			const result = await signAndExecute({
				transaction: txb,
			})

			return result.digest
		},
		onSuccess: () => {
			queryClient.removeQueries({ queryKey: ["navi"] })
		},
	})
}

export function useFlashloanLeverage() {
	const account = useCurrentAccount()
	const client = useSuiClient()
	const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			coinType,
			decimals,
			depositAmount,
			leverageAmount,
			symbol,
		}: {
			coinType: string
			decimals: number
			depositAmount: string // Principal amount to deposit
			leverageAmount: string // Amount to flashloan & borrow (Added to deposit)
			symbol?: string
		}) => {
			if (!account?.address) throw new Error("Wallet not connected")

			const depositAmountRaw = parseAmount(depositAmount, decimals)
			const leverageAmountRaw = parseAmount(leverageAmount, decimals)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const coins = await getCoins(account.address, {
				coinType,
				client: client as any,
			})

			if (coins.length === 0) {
				throw new Error(`No ${symbol ?? "token"} coins found in wallet`)
			}

			// Fetch Pool Configuration
			const pools = await getPools({ env: "prod" })
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const pool = Object.values(pools).find((p: any) => {
				const ct = p.coinType ?? p.suiCoinType ?? ""
				return (
					normalizeCoinType(ct) === normalizeCoinType(coinType) ||
					normalizeCoinType(p.suiCoinType ?? "") ===
						normalizeCoinType(coinType)
				)
			})

			if (!pool) {
				throw new Error(`Pool configuration for ${coinType} not found`)
			}

			const isSui =
				normalizeCoinType(coinType) ===
				normalizeCoinType("0x2::sui::SUI")

			// Fetch Flashloan Configuration to get Fee
			const flashLoanAssets = await getAllFlashLoanAssets({ env: "prod" })
			const flashLoanAsset = flashLoanAssets.find((a) => {
				return (
					normalizeCoinType(a.coinType) ===
						normalizeCoinType(coinType) ||
					normalizeCoinType((pool as any).suiCoinType ?? "") ===
						normalizeCoinType(a.coinType)
				)
			})

			if (!flashLoanAsset) {
				throw new Error(
					`Flashloan not supported for ${symbol ?? coinType}`
				)
			}

			// Calculate Fee (plus a tiny buffer for rounding safety?)
			const feeRate = flashLoanAsset.flashloanFee // e.g., 0.0006 for 0.06%
			const feeAmountRaw =
				Math.ceil(Number(leverageAmountRaw) * feeRate) + 100 // +100 dust buffer

			if (Number(depositAmountRaw) <= feeAmountRaw) {
				throw new Error(
					`Principal deposit too small to cover flashloan fee (~${formatAmount(
						BigInt(feeAmountRaw),
						decimals
					)} ${symbol})`
				)
			}

			// Fetch Price Feeds to update Oracle
			const priceFeeds = await getPriceFeeds({ env: "prod" })
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const feed = priceFeeds.find(
				(f: any) =>
					normalizeCoinType(f.coinType) ===
					normalizeCoinType((pool as any).coinType)
			)

			const txb = new Transaction() as AnyTransaction

			// 0. Update Oracle Prices (Crucial for Health Factor check during Borrow)
			// This prevents MoveAbort 1502 (Stale Price / Calculation Error)
			if (feed) {
				console.log("Found price feed:", feed)
				await updateOraclePricesPTB(txb, [feed], {
					env: "prod",
					updatePythPriceFeeds: true,
				})
			} else {
				console.warn(
					`Price feed not found for ${coinType}, skipping oracle update`
				)
			}

			// 1. Flashloan: Borrow leverageAmount
			// Pass pool object instead of coinType
			const [flashLoanBalance, receipt] = await flashloanPTB(
				txb,
				pool,
				Number(leverageAmountRaw)
			)

			// Convert Balance to Coin (for Deposit)
			// Use pool.suiCoinType to ensure exact type matching with SDK's internal expectations
			const targetCoinType = (pool as any).suiCoinType || coinType
			const flashLoanCoin = txb.moveCall({
				target: "0x2::coin::from_balance",
				typeArguments: [targetCoinType],
				arguments: [flashLoanBalance],
			})

			// 2. Prepare Principal Coin
			let primaryCoin
			if (isSui) {
				primaryCoin = txb.gas
			} else {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				primaryCoin = txb.object((coins[0] as any).coinObjectId)
			}

			// 1. Get coin of value `depositAmountRaw` from wallet.
			const [userPrincipalCoin] = txb.splitCoins(primaryCoin, [
				depositAmountRaw,
			])
			// 2. Split `fee` from `userPrincipalCoin`.
			const [feeComponentCoin] = txb.splitCoins(userPrincipalCoin, [
				feeAmountRaw,
			])
			// 3. `userPrincipalCoin` now has `depositAmount - fee`.

			const depositAfterFee =
				BigInt(depositAmountRaw) - BigInt(feeAmountRaw)

			// 3. Deposit Principal (Minus Fee)
			await depositCoinPTB(txb, pool, userPrincipalCoin, {
				amount: Number(depositAfterFee),
				env: "prod",
			})

			// 4. Deposit Flashloaned Coin
			await depositCoinPTB(txb, pool, flashLoanCoin, {
				amount: Number(leverageAmountRaw),
				env: "prod",
			})

			// 5. Borrow: Borrow leverageAmount (to pay back flashloan)
			const borrowedCoin = await borrowCoinPTB(
				txb,
				pool,
				Number(leverageAmountRaw),
				{ env: "prod" }
			)

			// Merge Fee + Borrowed -> Repayment Coin
			txb.mergeCoins(borrowedCoin, [feeComponentCoin])

			// Convert Borrowed Coin to Balance (for Repay)
			const repaymentBalance = txb.moveCall({
				target: "0x2::coin::into_balance",
				typeArguments: [targetCoinType],
				arguments: [borrowedCoin],
			})

			// 6. Repay Flashloan
			const [remainingBalance] = await repayFlashLoanPTB(
				txb,
				pool,
				receipt,
				repaymentBalance
			)

			// Handle remaining balance (required because Balance doesn't have drop)
			// Convert back to Coin and transfer to user
			const remainingCoin = txb.moveCall({
				target: "0x2::coin::from_balance",
				typeArguments: [targetCoinType],
				arguments: [remainingBalance],
			})

			txb.transferObjects([remainingCoin], account.address)

			// Execute transaction
			const result = await signAndExecute({
				transaction: txb,
			})

			return result.digest
		},
		onSuccess: () => {
			queryClient.removeQueries({ queryKey: ["navi"] })
		},
	})
}

export function useFlashloanWithdraw() {
	const account = useCurrentAccount()
	const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			coinType,
			decimals,
			withdrawAmount,
			repayAmount,
			symbol,
		}: {
			coinType: string
			decimals: number
			withdrawAmount: string // Amount of Collateral to Withdraw
			repayAmount: string // Amount of Debt to Repay (using Flashloan)
			symbol?: string
		}) => {
			if (!account?.address) throw new Error("Wallet not connected")

			// Fetch fresh position data to get actual current debt (with interest)
			const freshStates = await getLendingState(account.address, {
				env: "prod",
			})
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const freshPosition = freshStates.find(
				(s: any) =>
					(s.coinType ?? s.pool?.coinType ?? "") === coinType
			)

			// Use actual on-chain borrow balance if available
			let actualRepayRaw = parseAmount(repayAmount, decimals)
			if (freshPosition) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const actualBorrowRaw = BigInt(
					Math.floor(
						parseFloat((freshPosition as any).borrowBalance ?? "0")
					)
				)

				// If user requested close to actual debt (within 2%), use actual debt
				// This handles the case where MAX was clicked but interest accrued
				const requestedNum = Number(actualRepayRaw)
				const actualNum = Number(actualBorrowRaw)
				const ratio =
					actualNum > 0 ? requestedNum / actualNum : Infinity

				if (ratio >= 0.98 && ratio <= 1.02 && actualBorrowRaw > 0) {
					// User likely intended full repay, use actual debt
					actualRepayRaw = actualBorrowRaw
					console.log(
						`Using actual borrow balance for full repay: ${actualBorrowRaw}`
					)
				} else if (actualRepayRaw > actualBorrowRaw && actualBorrowRaw > 0) {
					// User requested more than debt, cap to actual
					actualRepayRaw = actualBorrowRaw
					console.log(
						`Capping repay to actual borrow: ${actualBorrowRaw}`
					)
				}
				console.log(
					`Fresh borrow balance: ${actualBorrowRaw}, final repay: ${actualRepayRaw}`
				)
			}

			let withdrawAmountRaw = parseAmount(withdrawAmount, decimals)
			const repayAmountRaw = actualRepayRaw

			// Also check actual supply and cap if needed
			if (freshPosition) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const actualSupplyRaw = BigInt(
					Math.floor(
						parseFloat((freshPosition as any).supplyBalance ?? "0")
					)
				)
				if (withdrawAmountRaw > actualSupplyRaw && actualSupplyRaw > 0) {
					withdrawAmountRaw = actualSupplyRaw
					console.log(
						`Capping withdraw to actual supply: ${actualSupplyRaw}`
					)
				}
			}

			// Fetch Pool Configuration
			const pools = await getPools({ env: "prod" })
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const pool = Object.values(pools).find((p: any) => {
				const ct = p.coinType ?? p.suiCoinType ?? ""
				return (
					normalizeCoinType(ct) === normalizeCoinType(coinType) ||
					normalizeCoinType(p.suiCoinType ?? "") ===
						normalizeCoinType(coinType)
				)
			})

			if (!pool) {
				throw new Error(`Pool configuration for ${coinType} not found`)
			}

			// Fetch Flashloan Configuration to get Fee
			const flashLoanAssets = await getAllFlashLoanAssets({ env: "prod" })
			const flashLoanAsset = flashLoanAssets.find((a) => {
				return (
					normalizeCoinType(a.coinType) ===
						normalizeCoinType(coinType) ||
					normalizeCoinType((pool as any).suiCoinType ?? "") ===
						normalizeCoinType(a.coinType)
				)
			})

			if (!flashLoanAsset) {
				throw new Error(
					`Flashloan not supported for ${symbol ?? coinType}`
				)
			}

			// Calculate Fee for the Flashloan (which matches Repay Amount)
			const feeRate = flashLoanAsset.flashloanFee
			const feeAmountRaw =
				Math.ceil(Number(repayAmountRaw) * feeRate) + 100
			const totalFlashloanRepayRaw =
				BigInt(repayAmountRaw) + BigInt(feeAmountRaw)

			if (BigInt(withdrawAmountRaw) <= totalFlashloanRepayRaw) {
				throw new Error(
					`Withdraw amount too small. Must cover Repay Amount + Fee (~${formatAmount(
						totalFlashloanRepayRaw,
						decimals
					)} ${symbol}). You requested withdraw: ${withdrawAmount}`
				)
			}

			const txb = new Transaction() as AnyTransaction

			// 0. Update Oracle Prices
			const priceFeeds = await getPriceFeeds({ env: "prod" })
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const feed = priceFeeds.find(
				(f: any) =>
					normalizeCoinType(f.coinType) ===
					normalizeCoinType((pool as any).coinType)
			)
			if (feed) {
				await updateOraclePricesPTB(txb, [feed], {
					env: "prod",
					updatePythPriceFeeds: true,
				})
			}

			// 1. Flashloan: Borrow `repayAmount` (to pay off user debt)
			const [flashLoanBalance, receipt] = await flashloanPTB(
				txb,
				pool,
				Number(repayAmountRaw)
			)

			// Convert Balance to Coin (for Repay)
			const targetCoinType = (pool as any).suiCoinType || coinType
			const flashLoanCoin = txb.moveCall({
				target: "0x2::coin::from_balance",
				typeArguments: [targetCoinType],
				arguments: [flashLoanBalance],
			})

			// 2. Repay User's Debt
			await repayCoinPTB(txb, pool, flashLoanCoin, {
				amount: Number(repayAmountRaw),
				env: "prod",
			})

			// 3. Withdraw Collateral
			// We withdraw the `withdrawAmount` specified by user
			const withdrawnCoin = await withdrawCoinPTB(
				txb,
				pool,
				Number(withdrawAmountRaw),
				{
					env: "prod",
				}
			)

			// 4. Prepare Flashloan Repayment (Principal + Fee)
			// Instead of splitting an exact amount, we convert the WHOLE withdrawn coin to balance.
			// The flashloan repayment will take what it needs and return the remainder as dust.
			const repaymentBalance = txb.moveCall({
				target: "0x2::coin::into_balance",
				typeArguments: [targetCoinType],
				arguments: [withdrawnCoin],
			})

			// 5. Repay Flashloan
			const [remainingBalance] = await repayFlashLoanPTB(
				txb,
				pool,
				receipt,
				repaymentBalance
			)

			// Handle remaining balance from flashloan repay (Collateral - Repayment - Fee)
			const remainingCoin = txb.moveCall({
				target: "0x2::coin::from_balance",
				typeArguments: [targetCoinType],
				arguments: [remainingBalance],
			})

			// Transfer clean User Profit/Remainder to user
			txb.transferObjects([remainingCoin], account.address)

			// Execute transaction
			const result = await signAndExecute({
				transaction: txb,
			})

			return result.digest
		},
		onSuccess: () => {
			queryClient.removeQueries({ queryKey: ["navi"] })
		},
	})
}

export function useRefreshData() {
	const queryClient = useQueryClient()
	const [isRefreshing, setIsRefreshing] = useState(false)

	const refresh = useCallback(async () => {
		console.log("Refreshing all Navi data...")
		setIsRefreshing(true)
		try {
			// Force refetch all navi queries
			await queryClient.refetchQueries({
				queryKey: ["navi"],
				type: "active",
			})
		} finally {
			setIsRefreshing(false)
		}
	}, [queryClient])

	return { refresh, isRefreshing }
}
