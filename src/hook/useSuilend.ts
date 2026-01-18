import { useCallback, useState } from "react"
import {
    useCurrentAccount,
    useSignAndExecuteTransaction,
    useSuiClient,
} from "@mysten/dapp-kit"
import { Transaction } from "@mysten/sui/transactions"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
    SuilendClient,
    LENDING_MARKET_ID,
    LENDING_MARKET_TYPE,
} from "@suilend/sdk"
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

function normalizeCoinType(coinType: string): string {
    const parts = coinType.split("::")
    if (parts.length !== 3) return coinType
    const pkg = parts[0].replace(/^0x/, "").padStart(64, "0")
    return `0x${pkg}::${parts[1]}::${parts[2]}`
}

export function usePools() {
    const client = useSuiClient()

    return useQuery({
        queryKey: ["suilend", "pools"],
        queryFn: async (): Promise<PoolData[]> => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const suilendClient = await SuilendClient.initialize(
                LENDING_MARKET_ID,
                LENDING_MARKET_TYPE,
                client as any
            )

            const lendingMarket = suilendClient.lendingMarket

            console.log("Suilend lending market:", lendingMarket)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reserves = (lendingMarket as any).reserves || []

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return reserves.map((reserve: any) => {
                const coinType = reserve.coinType?.name || ""
                const token = getTokenByCoinType(coinType)
                const decimals = reserve.mintDecimals ?? token?.decimals ?? 9
                const symbol =
                    token?.symbol ?? coinType.split("::").pop() ?? "UNKNOWN"

                // Extract APY from reserve config
                const supplyApy = reserve.depositApy ?? 0
                const borrowApy = reserve.borrowApy ?? 0

                // Extract totals
                const totalSupply = reserve.depositedAmount?.toString() ?? "0"
                const totalBorrow = reserve.borrowedAmount?.toString() ?? "0"
                const availableLiquidity =
                    reserve.availableAmount?.toString() ?? "0"

                // Price from oracle
                const price = reserve.price ?? 0

                // Liquidation threshold
                const liquidationThreshold =
                    reserve.config?.liquidationThreshold ?? 0.8

                return {
                    symbol,
                    coinType,
                    supplyApy,
                    borrowApy,
                    totalSupply: formatAmount(BigInt(totalSupply), decimals),
                    totalBorrow: formatAmount(BigInt(totalBorrow), decimals),
                    availableLiquidity: formatAmount(
                        BigInt(availableLiquidity),
                        decimals
                    ),
                    decimals,
                    price,
                    liquidationThreshold,
                }
            })
        },
        staleTime: 30000,
    })
}

export function useUserPositions() {
    const account = useCurrentAccount()
    const client = useSuiClient()

    return useQuery({
        queryKey: ["suilend", "positions", account?.address],
        queryFn: async (): Promise<UserPosition[]> => {
            if (!account?.address) return []

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obligationCaps = await SuilendClient.getObligationOwnerCaps(
                account.address,
                [LENDING_MARKET_TYPE],
                client as any
            )

            if (obligationCaps.length === 0) return []

            const obligationCap = obligationCaps[0]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obligation = await SuilendClient.getObligation(
                obligationCap.obligationId,
                [LENDING_MARKET_TYPE],
                client as any
            )

            console.log("Suilend obligation:", obligation)

            const positions: UserPosition[] = []

            // Process deposits
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const deposit of obligation.deposits || []) {
                const coinType = deposit.coinType?.name || ""
                const token = getTokenByCoinType(coinType)
                const decimals = token?.decimals ?? 9
                const symbol =
                    token?.symbol ?? coinType.split("::").pop() ?? "UNKNOWN"

                const suppliedRaw = BigInt(
                    deposit.depositedCtokenAmount?.toString() ?? "0"
                )

                positions.push({
                    symbol,
                    coinType,
                    supplied: formatAmount(suppliedRaw, decimals),
                    borrowed: "0",
                    suppliedRaw,
                    borrowedRaw: BigInt(0),
                })
            }

            // Process borrows
            const WAD = BigInt(10) ** BigInt(18)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const borrow of obligation.borrows || []) {
                const coinType = borrow.coinType?.name || ""
                const token = getTokenByCoinType(coinType)
                const decimals = token?.decimals ?? 9
                const symbol =
                    token?.symbol ?? coinType.split("::").pop() ?? "UNKNOWN"

                const borrowedRaw =
                    BigInt(borrow.borrowedAmount?.value?.toString() ?? "0") /
                    WAD

                // Find existing position or create new
                const existingIdx = positions.findIndex(
                    (p) =>
                        normalizeCoinType(p.coinType) ===
                        normalizeCoinType(coinType)
                )

                if (existingIdx >= 0) {
                    positions[existingIdx].borrowed = formatAmount(
                        borrowedRaw,
                        decimals
                    )
                    positions[existingIdx].borrowedRaw = borrowedRaw
                } else {
                    positions.push({
                        symbol,
                        coinType,
                        supplied: "0",
                        borrowed: formatAmount(borrowedRaw, decimals),
                        suppliedRaw: BigInt(0),
                        borrowedRaw,
                    })
                }
            }

            return positions
        },
        enabled: !!account?.address,
        staleTime: 10000,
    })
}

export function useHealthFactor() {
    const account = useCurrentAccount()
    const client = useSuiClient()

    return useQuery({
        queryKey: ["suilend", "healthFactor", account?.address],
        queryFn: async (): Promise<number> => {
            if (!account?.address) return Infinity

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obligationCaps = await SuilendClient.getObligationOwnerCaps(
                account.address,
                [LENDING_MARKET_TYPE],
                client as any
            )

            if (obligationCaps.length === 0) return Infinity

            const obligationCap = obligationCaps[0]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obligation = await SuilendClient.getObligation(
                obligationCap.obligationId,
                [LENDING_MARKET_TYPE],
                client as any
            )

            // Calculate health factor from obligation data
            // Health Factor = Weighted Collateral Value / Borrowed Value
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const depositValue = (obligation as any).depositedValueUsd ?? 0
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const borrowValue = (obligation as any).borrowedValueUsd ?? 0

            if (borrowValue === 0) return Infinity
            return depositValue / borrowValue
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

export function useMaxBorrow(coinType: string, _decimals: number = 9) {
    const account = useCurrentAccount()
    const client = useSuiClient()

    return useQuery({
        queryKey: ["suilend", "maxBorrow", account?.address, coinType],
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

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obligationCaps = await SuilendClient.getObligationOwnerCaps(
                account.address,
                [LENDING_MARKET_TYPE],
                client as any
            )

            if (obligationCaps.length === 0) {
                return {
                    maxBorrowAmount: "0",
                    maxBorrowValue: 0,
                    totalCollateralValue: 0,
                    totalBorrowValue: 0,
                    availableBorrowValue: 0,
                }
            }

            const obligationCap = obligationCaps[0]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obligation = await SuilendClient.getObligation(
                obligationCap.obligationId,
                [LENDING_MARKET_TYPE],
                client as any
            )

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const oblAny = obligation as any
            const totalCollateralValue = oblAny.allowedBorrowValueUsd ?? 0
            const totalBorrowValue = oblAny.borrowedValueUsd ?? 0
            const availableBorrowValue = Math.max(
                0,
                totalCollateralValue - totalBorrowValue
            )

            // Get target asset price (simplified - use 1 if unknown)
            const targetPrice = 1
            const maxBorrowAmount =
                targetPrice > 0 ? availableBorrowValue / targetPrice : 0

            return {
                maxBorrowAmount: maxBorrowAmount.toFixed(6).replace(/\.?0+$/, ""),
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

export function useMaxWithdraw(coinType: string, _decimals: number = 9) {
    const account = useCurrentAccount()
    const client = useSuiClient()

    return useQuery({
        queryKey: ["suilend", "maxWithdraw", account?.address, coinType],
        queryFn: async (): Promise<string> => {
            if (!account?.address || !coinType) return "0"

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obligationCaps = await SuilendClient.getObligationOwnerCaps(
                account.address,
                [LENDING_MARKET_TYPE],
                client as any
            )

            if (obligationCaps.length === 0) return "0"

            const obligationCap = obligationCaps[0]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obligation = await SuilendClient.getObligation(
                obligationCap.obligationId,
                [LENDING_MARKET_TYPE],
                client as any
            )

            // Find deposit for this coin type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const deposit = (obligation.deposits || []).find((d: any) => {
                const dCoinType = d.coinType?.name || ""
                return (
                    normalizeCoinType(dCoinType) === normalizeCoinType(coinType)
                )
            })

            if (!deposit) return "0"

            const token = getTokenByCoinType(coinType)
            const decimals = token?.decimals ?? 9
            const depositedRaw = BigInt(
                deposit.depositedCtokenAmount?.toString() ?? "0"
            )

            // If no borrows, can withdraw all
            if (!obligation.borrows || obligation.borrows.length === 0) {
                return formatAmount(depositedRaw, decimals)
            }

            // With borrows, calculate max withdraw while keeping HF >= 1
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const oblAny = obligation as any
            const allowedBorrow = oblAny.allowedBorrowValueUsd ?? 0
            const currentBorrow = oblAny.borrowedValueUsd ?? 0
            const excessValue = allowedBorrow - currentBorrow

            if (excessValue <= 0) return "0"

            // Apply safety buffer
            const SAFETY_BUFFER = 0.95
            const safeValue = excessValue * SAFETY_BUFFER

            // Convert to amount (simplified)
            const maxWithdrawAmount = safeValue
            const finalAmount = Math.min(
                maxWithdrawAmount,
                Number(depositedRaw) / Math.pow(10, decimals)
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
        queryKey: ["suilend", "coinBalance", account?.address, coinType],
        queryFn: async (): Promise<{
            balance: string
            balanceRaw: bigint
            coins: CoinBalance[]
        }> => {
            if (!account?.address)
                return { balance: "0", balanceRaw: BigInt(0), coins: [] }

            const coins = await client.getCoins({
                owner: account.address,
                coinType,
            })

            const totalBalance = coins.data.reduce(
                (sum, coin) => sum + BigInt(coin.balance),
                BigInt(0)
            )

            return {
                balance: formatAmount(totalBalance, decimals),
                balanceRaw: totalBalance,
                coins: coins.data.map((coin) => ({
                    coinObjectId: coin.coinObjectId,
                    balance: formatAmount(BigInt(coin.balance), decimals),
                    balanceRaw: BigInt(coin.balance),
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

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const suilendClient = await SuilendClient.initialize(
                LENDING_MARKET_ID,
                LENDING_MARKET_TYPE,
                client as any
            )

            const amountInSmallestUnit = parseAmount(amount, decimals)

            // Get or create obligation
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let obligationCaps = await SuilendClient.getObligationOwnerCaps(
                account.address,
                [LENDING_MARKET_TYPE],
                client as any
            )

            const txb = new Transaction() as AnyTransaction
            txb.setSender(account.address)

            let obligationCapId: string

            if (obligationCaps.length === 0) {
                // Create new obligation
                const newCap = suilendClient.createObligation(txb)
                txb.transferObjects([newCap], account.address)

                // Execute to create obligation first
                const createResult = await signAndExecute({
                    transaction: txb,
                })

                console.log("Created obligation:", createResult.digest)

                // Wait and refetch
                await new Promise((resolve) => setTimeout(resolve, 2000))
                obligationCaps = await SuilendClient.getObligationOwnerCaps(
                    account.address,
                    [LENDING_MARKET_TYPE],
                    client as any
                )

                if (obligationCaps.length === 0) {
                    throw new Error("Failed to create obligation")
                }
            }

            obligationCapId = obligationCaps[0].id

            // Now do the deposit
            const depositTx = new Transaction() as AnyTransaction
            depositTx.setSender(account.address)

            await suilendClient.depositIntoObligation(
                account.address,
                coinType,
                amountInSmallestUnit.toString(),
                depositTx,
                obligationCapId
            )

            const result = await signAndExecute({
                transaction: depositTx,
            })

            return result.digest
        },
        onSuccess: () => {
            queryClient.removeQueries({ queryKey: ["suilend"] })
        },
    })
}

export function useBorrow() {
    const account = useCurrentAccount()
    const client = useSuiClient()
    const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ coinType, decimals, amount }: MutationParams) => {
            if (!account?.address) throw new Error("Wallet not connected")

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const suilendClient = await SuilendClient.initialize(
                LENDING_MARKET_ID,
                LENDING_MARKET_TYPE,
                client as any
            )

            const amountInSmallestUnit = parseAmount(amount, decimals)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obligationCaps = await SuilendClient.getObligationOwnerCaps(
                account.address,
                [LENDING_MARKET_TYPE],
                client as any
            )

            if (obligationCaps.length === 0) {
                throw new Error("No obligation found. Please deposit first.")
            }

            const obligationCap = obligationCaps[0]

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obligation = await SuilendClient.getObligation(
                obligationCap.obligationId,
                [LENDING_MARKET_TYPE],
                client as any
            )

            const txb = new Transaction() as AnyTransaction
            txb.setSender(account.address)

            // Refresh obligation state before borrow
            await suilendClient.refreshAll(txb, obligation)

            // Borrow
            const borrowedCoin = await suilendClient.borrow(
                obligationCap.id,
                obligationCap.obligationId,
                coinType,
                amountInSmallestUnit.toString(),
                txb
            )

            // Transfer borrowed coin to user
            txb.transferObjects([borrowedCoin], account.address)

            const result = await signAndExecute({
                transaction: txb,
            })

            return result.digest
        },
        onSuccess: () => {
            queryClient.removeQueries({ queryKey: ["suilend"] })
        },
    })
}

export function useWithdraw() {
    const account = useCurrentAccount()
    const client = useSuiClient()
    const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ coinType, decimals, amount }: MutationParams) => {
            if (!account?.address) throw new Error("Wallet not connected")

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const suilendClient = await SuilendClient.initialize(
                LENDING_MARKET_ID,
                LENDING_MARKET_TYPE,
                client as any
            )

            const amountInSmallestUnit = parseAmount(amount, decimals)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obligationCaps = await SuilendClient.getObligationOwnerCaps(
                account.address,
                [LENDING_MARKET_TYPE],
                client as any
            )

            if (obligationCaps.length === 0) {
                throw new Error("No obligation found.")
            }

            const obligationCap = obligationCaps[0]

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obligation = await SuilendClient.getObligation(
                obligationCap.obligationId,
                [LENDING_MARKET_TYPE],
                client as any
            )

            const txb = new Transaction() as AnyTransaction
            txb.setSender(account.address)

            // Refresh obligation state before withdraw
            await suilendClient.refreshAll(txb, obligation)

            // Withdraw
            const withdrawnCoin = await suilendClient.withdraw(
                obligationCap.id,
                obligationCap.obligationId,
                coinType,
                amountInSmallestUnit.toString(),
                txb
            )

            // Transfer withdrawn coin to user
            txb.transferObjects([withdrawnCoin], account.address)

            const result = await signAndExecute({
                transaction: txb,
            })

            return result.digest
        },
        onSuccess: () => {
            queryClient.removeQueries({ queryKey: ["suilend"] })
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

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const suilendClient = await SuilendClient.initialize(
                LENDING_MARKET_ID,
                LENDING_MARKET_TYPE,
                client as any
            )

            const amountInSmallestUnit = parseAmount(amount, decimals)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obligationCaps = await SuilendClient.getObligationOwnerCaps(
                account.address,
                [LENDING_MARKET_TYPE],
                client as any
            )

            if (obligationCaps.length === 0) {
                throw new Error("No obligation found.")
            }

            const obligationCap = obligationCaps[0]

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obligation = await SuilendClient.getObligation(
                obligationCap.obligationId,
                [LENDING_MARKET_TYPE],
                client as any
            )

            const txb = new Transaction() as AnyTransaction
            txb.setSender(account.address)

            // Refresh obligation state before repay
            await suilendClient.refreshAll(txb, obligation)

            // Repay
            await suilendClient.repay(
                obligationCap.obligationId,
                coinType,
                amountInSmallestUnit.toString(),
                txb
            )

            const result = await signAndExecute({
                transaction: txb,
            })

            return result.digest
        },
        onSuccess: () => {
            queryClient.removeQueries({ queryKey: ["suilend"] })
        },
    })
}

export function useRefreshData() {
    const queryClient = useQueryClient()
    const [isRefreshing, setIsRefreshing] = useState(false)

    const refresh = useCallback(async () => {
        console.log("Refreshing all Suilend data...")
        setIsRefreshing(true)
        try {
            await queryClient.refetchQueries({
                queryKey: ["suilend"],
                type: "active",
            })
        } finally {
            setIsRefreshing(false)
        }
    }, [queryClient])

    return { refresh, isRefreshing }
}
