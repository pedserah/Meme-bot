class RealTradingManager {
    constructor(walletManager, tokenManager, raydiumManager) {
        this.walletManager = walletManager;
        this.tokenManager = tokenManager;
        this.raydiumManager = raydiumManager;
        
        // Trading state
        this.isTrading = false;
        this.tradingInterval = null;
        this.currentToken = null;
        this.tradingStats = {
            totalTrades: 0,
            buyTrades: 0,
            sellTrades: 0,
            successfulTrades: 0,
            failedTrades: 0,
            startTime: null,
            lastTradeTime: null
        };
    }

    // Generate random trade parameters for real trading
    generateRandomTrade() {
        // 70% buy, 30% sell
        const isBuy = Math.random() < 0.7;
        
        // Use wallets 2-5 (walletId 2-5, since wallet 1 is for pool operations)
        const availableWallets = [2, 3, 4, 5];
        const walletId = availableWallets[Math.floor(Math.random() * availableWallets.length)];
        
        if (isBuy) {
            // Random SOL amount between 0.01 and 0.05 for real trading
            const solAmount = 0.01 + Math.random() * 0.04;
            return {
                type: 'BUY',
                walletId,
                amount: solAmount
            };
        } else {
            // For sells, we'll attempt with a random percentage of holdings
            // The actual amount will be determined when we check the balance
            const sellPercentage = 0.1 + Math.random() * 0.4; // 10-50%
            return {
                type: 'SELL',
                walletId,
                sellPercentage: sellPercentage
            };
        }
    }

    // Execute a real trade using Raydium
    async executeTrade(tradeParams) {
        if (!this.currentToken) {
            return {
                success: false,
                error: 'No token selected for trading'
            };
        }

        let result;
        try {
            if (tradeParams.type === 'BUY') {
                result = await this.raydiumManager.executeBuySwap(
                    this.currentToken, 
                    tradeParams.amount, 
                    tradeParams.walletId
                );
            } else {
                // For sell, we need to determine the actual token amount to sell
                const wallet = this.walletManager.getWallet(tradeParams.walletId);
                if (!wallet) {
                    return {
                        success: false,
                        error: `Wallet ${tradeParams.walletId} not found`
                    };
                }

                // Try to get current token balance (this is simplified - in real implementation 
                // would need to check the actual token account balance)
                // For now, we'll use a default small amount for testing
                const tokenAmountToSell = 10 + Math.random() * 40; // 10-50 tokens

                result = await this.raydiumManager.executeSellSwap(
                    this.currentToken, 
                    tokenAmountToSell, 
                    tradeParams.walletId
                );
            }

            if (result.success) {
                // Update trading stats
                this.tradingStats.totalTrades++;
                this.tradingStats.successfulTrades++;
                if (result.type === 'BUY') {
                    this.tradingStats.buyTrades++;
                } else {
                    this.tradingStats.sellTrades++;
                }
                this.tradingStats.lastTradeTime = new Date();
            } else {
                this.tradingStats.totalTrades++;
                this.tradingStats.failedTrades++;
            }

            return result;

        } catch (error) {
            console.error('❌ Trade execution error:', error);
            this.tradingStats.totalTrades++;
            this.tradingStats.failedTrades++;
            
            return {
                success: false,
                error: error.message || 'Trade execution failed'
            };
        }
    }

    // Start real automated trading
    startTrading(tokenMint, onTradeCallback) {
        if (this.isTrading) {
            return {
                success: false,
                error: 'Trading is already active'
            };
        }

        // Check if pool exists for this token
        if (!this.raydiumManager.hasPool(tokenMint)) {
            return {
                success: false,
                error: 'No pool found for this token. Create pool first with /create_pool'
            };
        }

        this.currentToken = tokenMint;
        this.isTrading = true;
        this.tradingStats.startTime = new Date();
        this.tradingStats.totalTrades = 0;
        this.tradingStats.buyTrades = 0;
        this.tradingStats.sellTrades = 0;
        this.tradingStats.successfulTrades = 0;
        this.tradingStats.failedTrades = 0;

        const executeTradingLoop = async () => {
            if (!this.isTrading) {
                return;
            }

            try {
                // Generate and execute random trade
                const tradeParams = this.generateRandomTrade();
                const result = await this.executeTrade(tradeParams);

                // Call the callback with trade result
                if (onTradeCallback) {
                    onTradeCallback(result);
                }

            } catch (error) {
                console.error('❌ Trading loop error:', error);
                if (onTradeCallback) {
                    onTradeCallback({
                        success: false,
                        error: error.message || 'Trading loop error'
                    });
                }
            }

            // Schedule next trade with random delay (30-90 seconds as requested)
            if (this.isTrading) {
                const nextDelay = (30 + Math.random() * 60) * 1000; // 30-90 seconds in milliseconds
                this.tradingInterval = setTimeout(executeTradingLoop, nextDelay);
            }
        };

        // Start the first trade with initial delay
        const initialDelay = (5 + Math.random() * 10) * 1000; // 5-15 seconds initial delay
        this.tradingInterval = setTimeout(executeTradingLoop, initialDelay);

        return {
            success: true,
            message: 'Real automated trading started'
        };
    }

    // Stop automated trading
    stopTrading() {
        if (!this.isTrading) {
            return {
                success: false,
                error: 'Trading is not active'
            };
        }

        this.isTrading = false;
        if (this.tradingInterval) {
            clearTimeout(this.tradingInterval);
            this.tradingInterval = null;
        }

        return {
            success: true,
            stats: { ...this.tradingStats }
        };
    }

    // Execute rugpull - sell all tokens from all wallets and remove liquidity
    async executeRugpull(tokenMint) {
        console.log(`🔴 Starting rugpull for ${tokenMint}...`);

        const tokenInfo = this.tokenManager.getToken(tokenMint);
        if (!tokenInfo) {
            throw new Error('Token not found');
        }

        const rugpullResults = {
            tokensSold: 0,
            solRecovered: 0,
            liquidityRemoved: false,
            liquiditySOL: 0,
            liquidityTokens: 0,
            tradingWalletResults: [],
            liquidityResult: null
        };

        try {
            // Step 1: Sell all tokens from trading wallets (2-5)
            console.log('🔴 Step 1: Selling tokens from trading wallets...');
            
            for (let walletId = 2; walletId <= 5; walletId++) {
                try {
                    // Try to sell a reasonable amount (this is simplified)
                    // In real implementation, would check actual token balance first
                    const sellAmount = 50 + Math.random() * 100; // 50-150 tokens
                    
                    const sellResult = await this.raydiumManager.executeSellSwap(
                        tokenMint, 
                        sellAmount, 
                        walletId
                    );

                    if (sellResult.success) {
                        rugpullResults.tokensSold += sellResult.tokensSold;
                        rugpullResults.solRecovered += sellResult.solReceived;
                        rugpullResults.tradingWalletResults.push(sellResult);
                        console.log(`✅ Sold ${sellResult.tokensSold} tokens from wallet ${walletId}`);
                    } else {
                        console.log(`⚠️ Failed to sell from wallet ${walletId}: ${sellResult.error}`);
                    }
                } catch (error) {
                    console.log(`⚠️ Error selling from wallet ${walletId}: ${error.message}`);
                }
            }

            // Step 2: Remove liquidity from pool using wallet 1
            console.log('🔴 Step 2: Removing liquidity from pool...');
            
            try {
                const liquidityResult = await this.raydiumManager.rugpullPool(tokenMint);
                
                if (liquidityResult.success) {
                    rugpullResults.liquidityRemoved = true;
                    rugpullResults.liquiditySOL = liquidityResult.recoveredSOL;
                    rugpullResults.liquidityTokens = liquidityResult.recoveredTokens;
                    rugpullResults.liquidityResult = liquidityResult;
                    console.log(`✅ Removed liquidity: ${liquidityResult.recoveredSOL} SOL, ${liquidityResult.recoveredTokens} tokens`);
                } else {
                    console.log('⚠️ Failed to remove liquidity from pool');
                }
            } catch (error) {
                console.log(`⚠️ Error removing liquidity: ${error.message}`);
            }

            // Calculate total recovery
            const totalSOLRecovered = rugpullResults.solRecovered + rugpullResults.liquiditySOL;

            console.log(`🎯 Rugpull complete: ${totalSOLRecovered.toFixed(4)} SOL recovered`);

            return {
                success: true,
                totalTokensSold: rugpullResults.tokensSold,
                totalSOLRecovered: totalSOLRecovered,
                liquidityRemoved: rugpullResults.liquidityRemoved,
                tradingWalletSales: rugpullResults.tradingWalletResults.length,
                details: rugpullResults
            };

        } catch (error) {
            console.error('❌ Rugpull failed:', error);
            throw error;
        }
    }

    // Get current trading status
    getTradingStatus() {
        return {
            isTrading: this.isTrading,
            currentToken: this.currentToken,
            stats: { ...this.tradingStats }
        };
    }

    // Format trade result for Telegram (delegates to RaydiumManager)
    formatTradeForTelegram(tradeResult) {
        return this.raydiumManager.formatTradeForTelegram(tradeResult);
    }
}

module.exports = RealTradingManager;