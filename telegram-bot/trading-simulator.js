class TradingSimulator {
    constructor(walletManager, tokenManager) {
        this.walletManager = walletManager;
        this.tokenManager = tokenManager;
        
        // Simulated balances - tracks token holdings for each wallet
        this.simulatedBalances = new Map(); // tokenMint -> { walletId -> balance }
        this.simulatedSOLBalances = new Map(); // walletId -> SOL balance
        
        // Trading state
        this.isTrading = false;
        this.tradingInterval = null;
        this.currentToken = null;
        this.tradingStats = {
            totalTrades: 0,
            buyTrades: 0,
            sellTrades: 0,
            startTime: null,
            lastTradeTime: null
        };
        
        // Initialize simulated SOL balances
        this.initializeSOLBalances();
    }

    initializeSOLBalances() {
        // Initialize with current real SOL balances as baseline
        for (let i = 1; i <= 5; i++) {
            const wallet = this.walletManager.getWallet(i);
            if (wallet) {
                this.simulatedSOLBalances.set(i, wallet.balance || 5.0); // Default 5 SOL if no balance
            }
        }
    }

    initializeTokenForTrading(tokenMint) {
        this.currentToken = tokenMint;
        
        // Initialize token balances - assume all tokens start in wallet 1
        if (!this.simulatedBalances.has(tokenMint)) {
            this.simulatedBalances.set(tokenMint, new Map());
            
            // Get token info to know total supply
            const tokenInfo = this.tokenManager.getToken(tokenMint);
            if (tokenInfo) {
                // All tokens start in wallet 1 (as per token creation)
                this.simulatedBalances.get(tokenMint).set(1, tokenInfo.totalSupply);
                
                // Initialize other wallets with 0 balance
                for (let i = 2; i <= 5; i++) {
                    this.simulatedBalances.get(tokenMint).set(i, 0);
                }
            }
        }
    }

    getTokenBalance(tokenMint, walletId) {
        if (!this.simulatedBalances.has(tokenMint)) {
            return 0;
        }
        return this.simulatedBalances.get(tokenMint).get(walletId) || 0;
    }

    getSOLBalance(walletId) {
        return this.simulatedSOLBalances.get(walletId) || 0;
    }

    // Simulate a buy trade: SOL -> Token
    simulateBuy(tokenMint, walletId, solAmount) {
        const solBalance = this.getSOLBalance(walletId);
        
        if (solBalance < solAmount) {
            return {
                success: false,
                error: `Insufficient SOL balance. Has: ${solBalance.toFixed(4)}, Needs: ${solAmount.toFixed(4)}`
            };
        }

        // Simulate token price (for simulation, use simple conversion rate)
        const tokenPrice = 0.001; // 1 token = 0.001 SOL (adjustable)
        const tokensReceived = solAmount / tokenPrice;

        // Update balances
        this.simulatedSOLBalances.set(walletId, solBalance - solAmount);
        
        const currentTokenBalance = this.getTokenBalance(tokenMint, walletId);
        this.simulatedBalances.get(tokenMint).set(walletId, currentTokenBalance + tokensReceived);

        return {
            success: true,
            type: 'BUY',
            walletId,
            solSpent: solAmount,
            tokensReceived: tokensReceived,
            tokenPrice: tokenPrice,
            newSOLBalance: this.getSOLBalance(walletId),
            newTokenBalance: this.getTokenBalance(tokenMint, walletId)
        };
    }

    // Simulate a sell trade: Token -> SOL
    simulateSell(tokenMint, walletId, tokenAmount) {
        const tokenBalance = this.getTokenBalance(tokenMint, walletId);
        
        if (tokenBalance < tokenAmount) {
            return {
                success: false,
                error: `Insufficient token balance. Has: ${tokenBalance.toFixed(4)}, Needs: ${tokenAmount.toFixed(4)}`
            };
        }

        // Simulate token price (slightly lower for sells to simulate slippage)
        const tokenPrice = 0.0009; // 1 token = 0.0009 SOL (slight slippage)
        const solReceived = tokenAmount * tokenPrice;

        // Update balances
        const currentSOLBalance = this.getSOLBalance(walletId);
        this.simulatedSOLBalances.set(walletId, currentSOLBalance + solReceived);
        
        this.simulatedBalances.get(tokenMint).set(walletId, tokenBalance - tokenAmount);

        return {
            success: true,
            type: 'SELL',
            walletId,
            tokensSold: tokenAmount,
            solReceived: solReceived,
            tokenPrice: tokenPrice,
            newSOLBalance: this.getSOLBalance(walletId),
            newTokenBalance: this.getTokenBalance(tokenMint, walletId)
        };
    }

    // Generate random trade parameters
    generateRandomTrade() {
        // 70% buy, 30% sell
        const isBuy = Math.random() < 0.7;
        
        // Use wallets 2-5 (walletId 2-5, since wallet 1 holds the initial token supply)
        const availableWallets = [2, 3, 4, 5];
        const walletId = availableWallets[Math.floor(Math.random() * availableWallets.length)];
        
        if (isBuy) {
            // Random SOL amount between 0.01 and 0.1
            const solAmount = 0.01 + Math.random() * 0.09;
            return {
                type: 'BUY',
                walletId,
                amount: solAmount
            };
        } else {
            // For sells, check if wallet has tokens
            const tokenBalance = this.getTokenBalance(this.currentToken, walletId);
            if (tokenBalance > 0) {
                // Sell 10-50% of token balance
                const sellPercentage = 0.1 + Math.random() * 0.4;
                const tokenAmount = tokenBalance * sellPercentage;
                return {
                    type: 'SELL',
                    walletId,
                    amount: tokenAmount
                };
            } else {
                // If no tokens to sell, make it a buy instead
                const solAmount = 0.01 + Math.random() * 0.09;
                return {
                    type: 'BUY',
                    walletId,
                    amount: solAmount
                };
            }
        }
    }

    // Execute a simulated trade
    executeTrade(tradeParams) {
        if (!this.currentToken) {
            return {
                success: false,
                error: 'No token selected for trading'
            };
        }

        let result;
        if (tradeParams.type === 'BUY') {
            result = this.simulateBuy(this.currentToken, tradeParams.walletId, tradeParams.amount);
        } else {
            result = this.simulateSell(this.currentToken, tradeParams.walletId, tradeParams.amount);
        }

        if (result.success) {
            // Update trading stats
            this.tradingStats.totalTrades++;
            if (result.type === 'BUY') {
                this.tradingStats.buyTrades++;
            } else {
                this.tradingStats.sellTrades++;
            }
            this.tradingStats.lastTradeTime = new Date();
        }

        return result;
    }

    // Start automated trading
    startTrading(tokenMint, onTradeCallback) {
        if (this.isTrading) {
            return {
                success: false,
                error: 'Trading is already active'
            };
        }

        this.initializeTokenForTrading(tokenMint);
        this.isTrading = true;
        this.tradingStats.startTime = new Date();
        this.tradingStats.totalTrades = 0;
        this.tradingStats.buyTrades = 0;
        this.tradingStats.sellTrades = 0;

        const executeTradingLoop = () => {
            if (!this.isTrading) {
                return;
            }

            // Generate and execute random trade
            const tradeParams = this.generateRandomTrade();
            const result = this.executeTrade(tradeParams);

            // Call the callback with trade result
            if (onTradeCallback) {
                onTradeCallback(result);
            }

            // Schedule next trade with random delay (45-120 seconds)
            const nextDelay = (45 + Math.random() * 75) * 1000; // 45-120 seconds in milliseconds
            this.tradingInterval = setTimeout(executeTradingLoop, nextDelay);
        };

        // Start the first trade with initial delay
        const initialDelay = (5 + Math.random() * 10) * 1000; // 5-15 seconds initial delay
        this.tradingInterval = setTimeout(executeTradingLoop, initialDelay);

        return {
            success: true,
            message: 'Automated trading started'
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

    // Rugpull: Sell all tokens from all wallets and return SOL to wallet 1
    rugpull(tokenMint) {
        if (!this.simulatedBalances.has(tokenMint)) {
            return {
                success: false,
                error: 'No token balances found'
            };
        }

        const rugpullResults = [];
        let totalSOLRecovered = 0;
        let totalTokensSold = 0;

        // Sell tokens from wallets 2-5
        for (let walletId = 2; walletId <= 5; walletId++) {
            const tokenBalance = this.getTokenBalance(tokenMint, walletId);
            
            if (tokenBalance > 0) {
                const sellResult = this.simulateSell(tokenMint, walletId, tokenBalance);
                if (sellResult.success) {
                    rugpullResults.push(sellResult);
                    totalSOLRecovered += sellResult.solReceived;
                    totalTokensSold += sellResult.tokensSold;
                }
            }
        }

        // Transfer all recovered SOL to wallet 1
        if (totalSOLRecovered > 0) {
            const wallet1SOL = this.getSOLBalance(1);
            this.simulatedSOLBalances.set(1, wallet1SOL + totalSOLRecovered);
            
            // Zero out SOL balances from other wallets (simulating transfer)
            for (let walletId = 2; walletId <= 5; walletId++) {
                this.simulatedSOLBalances.set(walletId, 0);
            }
        }

        return {
            success: true,
            totalTokensSold,
            totalSOLRecovered,
            tradesExecuted: rugpullResults.length,
            newWallet1SOLBalance: this.getSOLBalance(1),
            details: rugpullResults
        };
    }

    // Get current trading status
    getTradingStatus() {
        return {
            isTrading: this.isTrading,
            currentToken: this.currentToken,
            stats: { ...this.tradingStats }
        };
    }

    // Get all simulated balances summary
    getBalancesSummary() {
        const summary = {
            solBalances: {},
            tokenBalances: {}
        };

        // SOL balances
        for (let walletId = 1; walletId <= 5; walletId++) {
            summary.solBalances[walletId] = this.getSOLBalance(walletId);
        }

        // Token balances
        if (this.currentToken) {
            summary.tokenBalances[this.currentToken] = {};
            for (let walletId = 1; walletId <= 5; walletId++) {
                summary.tokenBalances[this.currentToken][walletId] = this.getTokenBalance(this.currentToken, walletId);
            }
        }

        return summary;
    }

    // Format trade result for Telegram
    formatTradeForTelegram(tradeResult) {
        if (!tradeResult.success) {
            return `❌ Trade failed: ${tradeResult.error}`;
        }

        const tokenInfo = this.tokenManager.getToken(this.currentToken);
        const symbol = tokenInfo ? tokenInfo.symbol : 'TOKEN';

        if (tradeResult.type === 'BUY') {
            return `
🟢 *BUY EXECUTED* (Simulated)

💰 Wallet: ${tradeResult.walletId}
💸 SOL Spent: ${tradeResult.solSpent.toFixed(4)} SOL
🪙 Tokens Received: ${tradeResult.tokensReceived.toFixed(2)} ${symbol}
📊 Price: ${tradeResult.tokenPrice.toFixed(6)} SOL per ${symbol}

New Balances:
💰 SOL: ${tradeResult.newSOLBalance.toFixed(4)}
🪙 ${symbol}: ${tradeResult.newTokenBalance.toFixed(2)}
            `;
        } else {
            return `
🔴 *SELL EXECUTED* (Simulated)

💰 Wallet: ${tradeResult.walletId}
🪙 Tokens Sold: ${tradeResult.tokensSold.toFixed(2)} ${symbol}
💸 SOL Received: ${tradeResult.solReceived.toFixed(4)} SOL
📊 Price: ${tradeResult.tokenPrice.toFixed(6)} SOL per ${symbol}

New Balances:
💰 SOL: ${tradeResult.newSOLBalance.toFixed(4)}
🪙 ${symbol}: ${tradeResult.newTokenBalance.toFixed(2)}
            `;
        }
    }
}

module.exports = TradingSimulator;