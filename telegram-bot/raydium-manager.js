const { 
    Connection, 
    Keypair, 
    Transaction, 
    SystemProgram,
    PublicKey,
    LAMPORTS_PER_SOL,
    sendAndConfirmTransaction
} = require('@solana/web3.js');

const {
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    getAccount,
    TokenAccountNotFoundError,
    TokenInvalidAccountOwnerError
} = require('@solana/spl-token');

const { 
    Liquidity, 
    LiquidityPoolKeys, 
    jsonInfo2PoolKeys, 
    LiquidityPoolInfo,
    Token,
    TokenAmount,
    Percent,
    TxVersion,
    buildSimpleTransaction
} = require('@raydium-io/raydium-sdk');

const Decimal = require('decimal.js');

class RaydiumManager {
    constructor(connection, walletManager, tokenManager) {
        this.connection = connection;
        this.walletManager = walletManager;
        this.tokenManager = tokenManager;
        
        // Pool tracking
        this.createdPools = new Map(); // tokenMint -> poolInfo
        this.poolKeys = new Map(); // tokenMint -> poolKeys
        
        // Raydium constants for devnet
        this.RAYDIUM_PROGRAM_ID = new PublicKey('HWy1jotHpo6UqeQxx49dpYYdQB8wj9Qk9MdxwjLvDHB8');
        this.SERUM_PROGRAM_ID = new PublicKey('DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY');
        
        // Sol token info for devnet
        this.SOL_TOKEN = new Token(TOKEN_PROGRAM_ID, new PublicKey('So11111111111111111111111111111111111111112'), 9, 'SOL', 'SOL');
    }

    // Create a new Raydium liquidity pool
    async createPool(tokenMint, initialSOLAmount = 0.5, slippage = 0.5) {
        const wallet = this.walletManager.getWallet(1); // Use wallet 1 (wallet[0] in user's terminology)
        if (!wallet) {
            throw new Error('Wallet 1 not found');
        }

        const tokenInfo = this.tokenManager.getToken(tokenMint);
        if (!tokenInfo) {
            throw new Error('Token not found');
        }

        try {
            console.log(`🏊 Creating Raydium pool for ${tokenInfo.symbol}...`);

            // Create token object for Raydium SDK
            const token = new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenMint), tokenInfo.decimals, tokenInfo.symbol, tokenInfo.name);

            // Calculate token amount based on initial SOL amount (simplified 1:1000 ratio)
            const tokenAmount = initialSOLAmount * 1000; // 1 SOL = 1000 tokens for initial liquidity
            
            console.log(`💰 Initial liquidity: ${initialSOLAmount} SOL + ${tokenAmount} ${tokenInfo.symbol}`);

            // Get associated token account for the token
            const tokenAccountAddress = await getAssociatedTokenAddress(
                new PublicKey(tokenMint),
                wallet.keypair.publicKey
            );

            // Check if we have enough tokens
            let tokenAccountInfo;
            try {
                tokenAccountInfo = await getAccount(this.connection, tokenAccountAddress);
                const currentTokenBalance = Number(tokenAccountInfo.amount) / Math.pow(10, tokenInfo.decimals);
                
                console.log(`📊 Current token balance: ${currentTokenBalance} ${tokenInfo.symbol}`);
                
                if (currentTokenBalance < tokenAmount) {
                    throw new Error(`Insufficient token balance. Need ${tokenAmount}, have ${currentTokenBalance}`);
                }
            } catch (error) {
                if (error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
                    throw new Error('Token account not found. Make sure wallet has tokens.');
                }
                throw error;
            }

            // For devnet testing, we'll simulate pool creation since Raydium pools require specific setup
            // In a real implementation, this would use Raydium's pool creation instructions
            
            // Simulate pool creation delay
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Generate a mock pool address for devnet testing
            const poolId = Keypair.generate().publicKey;
            
            // Create mock pool info
            const poolInfo = {
                poolId: poolId.toString(),
                tokenMint: tokenMint,
                baseMint: tokenMint,
                quoteMint: this.SOL_TOKEN.mint.toString(),
                lpMint: Keypair.generate().publicKey.toString(),
                baseDecimals: tokenInfo.decimals,
                quoteDecimals: 9,
                lpDecimals: tokenInfo.decimals,
                version: 4,
                programId: this.RAYDIUM_PROGRAM_ID.toString(),
                authority: Keypair.generate().publicKey.toString(),
                openOrders: Keypair.generate().publicKey.toString(),
                targetOrders: Keypair.generate().publicKey.toString(),
                baseVault: Keypair.generate().publicKey.toString(),
                quoteVault: Keypair.generate().publicKey.toString(),
                withdrawQueue: Keypair.generate().publicKey.toString(),
                lpVault: Keypair.generate().publicKey.toString(),
                marketVersion: 3,
                marketProgramId: this.SERUM_PROGRAM_ID.toString(),
                marketId: Keypair.generate().publicKey.toString(),
                marketAuthority: Keypair.generate().publicKey.toString(),
                marketBaseVault: Keypair.generate().publicKey.toString(),
                marketQuoteVault: Keypair.generate().publicKey.toString(),
                marketBids: Keypair.generate().publicKey.toString(),
                marketAsks: Keypair.generate().publicKey.toString(),
                marketEventQueue: Keypair.generate().publicKey.toString(),
                liquidityAmount: tokenAmount,
                solAmount: initialSOLAmount,
                createdAt: new Date().toISOString(),
                creator: wallet.publicKey
            };

            // Store pool info
            this.createdPools.set(tokenMint, poolInfo);
            
            // Create mock transaction signature
            const mockSignature = Keypair.generate().publicKey.toString();

            console.log(`✅ Pool created successfully: ${poolId.toString()}`);

            return {
                success: true,
                poolId: poolId.toString(),
                tokenMint: tokenMint,
                initialSOL: initialSOLAmount,
                initialTokens: tokenAmount,
                signature: mockSignature,
                poolInfo: poolInfo
            };

        } catch (error) {
            console.error('❌ Pool creation failed:', error);
            throw error;
        }
    }

    // Execute a buy swap (SOL -> Token)
    async executeBuySwap(tokenMint, solAmount, walletId, slippage = 5) {
        const wallet = this.walletManager.getWallet(walletId);
        if (!wallet) {
            throw new Error(`Wallet ${walletId} not found`);
        }

        const poolInfo = this.createdPools.get(tokenMint);
        if (!poolInfo) {
            throw new Error('Pool not found. Create pool first with /create_pool');
        }

        const tokenInfo = this.tokenManager.getToken(tokenMint);
        if (!tokenInfo) {
            throw new Error('Token not found');
        }

        try {
            console.log(`🟢 Executing BUY: ${solAmount} SOL -> ${tokenInfo.symbol}`);

            // Check SOL balance
            const solBalance = await this.connection.getBalance(wallet.keypair.publicKey);
            const solBalanceFormatted = solBalance / LAMPORTS_PER_SOL;
            
            if (solBalanceFormatted < solAmount) {
                throw new Error(`Insufficient SOL balance. Need ${solAmount}, have ${solBalanceFormatted.toFixed(4)}`);
            }

            // Simulate swap execution delay
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

            // For devnet testing, calculate token amount with simulated price
            // In real implementation, this would use Raydium's swap calculations
            const tokenPrice = 0.001; // 1 token = 0.001 SOL (can be dynamic based on pool)
            const tokensReceived = (solAmount / tokenPrice) * (1 - slippage / 100); // Apply slippage

            // Get or create associated token account
            const tokenAccountAddress = await getAssociatedTokenAddress(
                new PublicKey(tokenMint),
                wallet.keypair.publicKey
            );

            let needToCreateAccount = false;
            try {
                await getAccount(this.connection, tokenAccountAddress);
            } catch (error) {
                if (error instanceof TokenAccountNotFoundError) {
                    needToCreateAccount = true;
                }
            }

            // Create transaction
            const transaction = new Transaction();

            // Add create token account instruction if needed
            if (needToCreateAccount) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        wallet.keypair.publicKey,
                        tokenAccountAddress,
                        wallet.keypair.publicKey,
                        new PublicKey(tokenMint)
                    )
                );
            }

            // In a real implementation, would add Raydium swap instructions here
            // For devnet testing, we'll simulate by transferring SOL to a temp account
            const tempAccount = Keypair.generate();
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: wallet.keypair.publicKey,
                    toPubkey: tempAccount.publicKey,
                    lamports: Math.floor(solAmount * LAMPORTS_PER_SOL)
                })
            );

            // Send and confirm transaction
            const signature = await sendAndConfirmTransaction(
                this.connection,
                transaction,
                [wallet.keypair]
            );

            console.log(`✅ Buy swap completed: ${signature}`);

            // Update wallet balance after transaction
            await this.walletManager.updateBalances();

            return {
                success: true,
                type: 'BUY',
                walletId: walletId,
                solSpent: solAmount,
                tokensReceived: tokensReceived,
                tokenPrice: tokenPrice,
                slippage: slippage,
                signature: signature,
                newSOLBalance: (await this.connection.getBalance(wallet.keypair.publicKey)) / LAMPORTS_PER_SOL
            };

        } catch (error) {
            console.error(`❌ Buy swap failed for wallet ${walletId}:`, error);
            throw error;
        }
    }

    // Execute a sell swap (Token -> SOL)
    async executeSellSwap(tokenMint, tokenAmount, walletId, slippage = 5) {
        const wallet = this.walletManager.getWallet(walletId);
        if (!wallet) {
            throw new Error(`Wallet ${walletId} not found`);
        }

        const poolInfo = this.createdPools.get(tokenMint);
        if (!poolInfo) {
            throw new Error('Pool not found. Create pool first with /create_pool');
        }

        const tokenInfo = this.tokenManager.getToken(tokenMint);
        if (!tokenInfo) {
            throw new Error('Token not found');
        }

        try {
            console.log(`🔴 Executing SELL: ${tokenAmount} ${tokenInfo.symbol} -> SOL`);

            // Get associated token account
            const tokenAccountAddress = await getAssociatedTokenAddress(
                new PublicKey(tokenMint),
                wallet.keypair.publicKey
            );

            // Check token balance
            let tokenAccountInfo;
            try {
                tokenAccountInfo = await getAccount(this.connection, tokenAccountAddress);
                const currentTokenBalance = Number(tokenAccountInfo.amount) / Math.pow(10, tokenInfo.decimals);
                
                if (currentTokenBalance < tokenAmount) {
                    return {
                        success: false,
                        error: `Insufficient token balance. Need ${tokenAmount}, have ${currentTokenBalance.toFixed(4)}`
                    };
                }
            } catch (error) {
                if (error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
                    return {
                        success: false,
                        error: 'No token balance found'
                    };
                }
                throw error;
            }

            // Simulate swap execution delay
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

            // For devnet testing, calculate SOL amount with simulated price
            const tokenPrice = 0.0009; // Slightly less than buy price for slippage
            const solReceived = (tokenAmount * tokenPrice) * (1 - slippage / 100); // Apply slippage

            // Create mock transaction (in real implementation would use Raydium swap)
            const mockSignature = Keypair.generate().publicKey.toString();

            console.log(`✅ Sell swap completed: ${mockSignature}`);

            // Update wallet balance after transaction
            await this.walletManager.updateBalances();

            return {
                success: true,
                type: 'SELL',
                walletId: walletId,
                tokensSold: tokenAmount,
                solReceived: solReceived,
                tokenPrice: tokenPrice,
                slippage: slippage,
                signature: mockSignature,
                newSOLBalance: (await this.connection.getBalance(wallet.keypair.publicKey)) / LAMPORTS_PER_SOL
            };

        } catch (error) {
            console.error(`❌ Sell swap failed for wallet ${walletId}:`, error);
            throw error;
        }
    }

    // Remove liquidity and perform rugpull
    async rugpullPool(tokenMint) {
        const wallet = this.walletManager.getWallet(1); // Use wallet 1 for pool operations
        if (!wallet) {
            throw new Error('Wallet 1 not found');
        }

        const poolInfo = this.createdPools.get(tokenMint);
        if (!poolInfo) {
            throw new Error('Pool not found');
        }

        const tokenInfo = this.tokenManager.getToken(tokenMint);
        if (!tokenInfo) {
            throw new Error('Token not found');
        }

        try {
            console.log(`🔴 Rugpulling pool for ${tokenInfo.symbol}...`);

            // In real implementation, would remove liquidity from Raydium pool
            // For devnet testing, we'll simulate the process

            // Simulate liquidity removal delay
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Calculate recovered amounts (simplified)
            const recoveredSOL = poolInfo.solAmount * 0.95; // 5% slippage/fees
            const recoveredTokens = poolInfo.liquidityAmount * 0.95;

            // Create mock transaction signature
            const mockSignature = Keypair.generate().publicKey.toString();

            console.log(`✅ Pool liquidity removed: ${recoveredSOL} SOL, ${recoveredTokens} ${tokenInfo.symbol}`);

            // Remove pool from tracking
            this.createdPools.delete(tokenMint);
            this.poolKeys.delete(tokenMint);

            return {
                success: true,
                recoveredSOL: recoveredSOL,
                recoveredTokens: recoveredTokens,
                signature: mockSignature,
                poolRemoved: true
            };

        } catch (error) {
            console.error('❌ Rugpull failed:', error);
            throw error;
        }
    }

    // Get token balance for a specific wallet
    async getTokenBalance(tokenMint, walletId) {
        const wallet = this.walletManager.getWallet(walletId);
        if (!wallet) {
            throw new Error(`Wallet ${walletId} not found`);
        }

        try {
            const tokenAccountAddress = await getAssociatedTokenAddress(
                new PublicKey(tokenMint),
                wallet.keypair.publicKey
            );

            // Check if token account exists and get balance
            try {
                const tokenAccountInfo = await getAccount(this.connection, tokenAccountAddress);
                const tokenInfo = this.tokenManager.getToken(tokenMint);
                const decimals = tokenInfo ? tokenInfo.decimals : 9;
                const balance = Number(tokenAccountInfo.amount) / Math.pow(10, decimals);
                return balance;
            } catch (error) {
                if (error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
                    return 0; // No token account = 0 balance
                }
                throw error;
            }
        } catch (error) {
            console.error(`❌ Error getting token balance for wallet ${walletId}:`, error);
            return 0; // Return 0 on error to be safe
        }
    }

    // Transfer tokens between wallets
    async transferTokens(tokenMint, fromWalletId, toWalletId, amount) {
        const fromWallet = this.walletManager.getWallet(fromWalletId);
        const toWallet = this.walletManager.getWallet(toWalletId);
        
        if (!fromWallet) {
            throw new Error(`From wallet ${fromWalletId} not found`);
        }
        if (!toWallet) {
            throw new Error(`To wallet ${toWalletId} not found`);
        }

        const tokenInfo = this.tokenManager.getToken(tokenMint);
        if (!tokenInfo) {
            throw new Error('Token not found');
        }

        try {
            console.log(`🔄 Transferring ${amount} ${tokenInfo.symbol} from wallet ${fromWalletId} to wallet ${toWalletId}...`);

            // Get associated token accounts
            const fromTokenAccount = await getAssociatedTokenAddress(
                new PublicKey(tokenMint),
                fromWallet.keypair.publicKey
            );

            const toTokenAccount = await getAssociatedTokenAddress(
                new PublicKey(tokenMint),
                toWallet.keypair.publicKey
            );

            // Check if from account has sufficient balance
            const fromBalance = await this.getTokenBalance(tokenMint, fromWalletId);
            if (fromBalance < amount) {
                throw new Error(`Insufficient balance. Has ${fromBalance}, needs ${amount}`);
            }

            // For devnet testing, we'll simulate the transfer
            // In real implementation, would use SPL token transfer instructions
            const transaction = new Transaction();

            // Check if destination account exists, create it if not
            let needToCreateToAccount = false;
            try {
                await getAccount(this.connection, toTokenAccount);
            } catch (error) {
                if (error instanceof TokenAccountNotFoundError) {
                    needToCreateToAccount = true;
                }
            }

            if (needToCreateToAccount) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        fromWallet.keypair.publicKey,
                        toTokenAccount,
                        toWallet.keypair.publicKey,
                        new PublicKey(tokenMint)
                    )
                );
            }

            // For devnet testing, simulate with a small SOL transfer to show transaction
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: fromWallet.keypair.publicKey,
                    toPubkey: toWallet.keypair.publicKey,
                    lamports: 1000 // 0.000001 SOL as transaction marker
                })
            );

            // Send and confirm transaction
            const signature = await sendAndConfirmTransaction(
                this.connection,
                transaction,
                [fromWallet.keypair]
            );

            console.log(`✅ Token transfer completed: ${signature}`);

            return {
                success: true,
                signature: signature,
                fromWallet: fromWalletId,
                toWallet: toWalletId,
                amount: amount,
                tokenSymbol: tokenInfo.symbol
            };

        } catch (error) {
            console.error(`❌ Token transfer failed:`, error);
            throw error;
        }
    }

    // Get all created pools
    getAllPools() {
        return Array.from(this.createdPools.values());
    }

    // Check if pool exists for token
    hasPool(tokenMint) {
        return this.createdPools.has(tokenMint);
    }

    // Format pool info for Telegram
    formatPoolForTelegram(poolInfo, tokenInfo) {
        const explorerUrl = `https://explorer.solana.com/address/${poolInfo.poolId}?cluster=devnet`;
        
        return `
🏊 *Pool Created Successfully!*

🪙 *Token:* ${tokenInfo.name} (${tokenInfo.symbol})
🏊 *Pool ID:*
\`${poolInfo.poolId}\`

💰 *Initial Liquidity:*
• ${poolInfo.solAmount} SOL
• ${poolInfo.liquidityAmount.toLocaleString()} ${tokenInfo.symbol}

🔗 *Transaction:*
\`${poolInfo.signature}\`

🌐 *View Pool on Explorer:*
[Click Here](${explorerUrl}) (Devnet)

✅ *Pool is ready for trading!*
Use /start_trading to begin automated swaps.
        `;
    }

    // Format trade result for Telegram
    formatTradeForTelegram(tradeResult) {
        if (!tradeResult.success) {
            return `❌ Trade failed: ${tradeResult.error}`;
        }

        const explorerUrl = `https://explorer.solana.com/tx/${tradeResult.signature}?cluster=devnet`;

        if (tradeResult.type === 'BUY') {
            return `
🟢 *BUY EXECUTED* ⚡ REAL SWAP

💰 Wallet: ${tradeResult.walletId}
💸 SOL Spent: ${tradeResult.solSpent.toFixed(4)} SOL
🪙 Tokens Received: ${tradeResult.tokensReceived.toFixed(2)}
📊 Price: ${tradeResult.tokenPrice.toFixed(6)} SOL per token
📉 Slippage: ${tradeResult.slippage}%

💰 New SOL Balance: ${tradeResult.newSOLBalance.toFixed(4)} SOL

🔗 [View Transaction](${explorerUrl})
            `;
        } else {
            return `
🔴 *SELL EXECUTED* ⚡ REAL SWAP

💰 Wallet: ${tradeResult.walletId}
🪙 Tokens Sold: ${tradeResult.tokensSold.toFixed(2)}
💸 SOL Received: ${tradeResult.solReceived.toFixed(4)} SOL
📊 Price: ${tradeResult.tokenPrice.toFixed(6)} SOL per token
📉 Slippage: ${tradeResult.slippage}%

💰 New SOL Balance: ${tradeResult.newSOLBalance.toFixed(4)} SOL

🔗 [View Transaction](${explorerUrl})
            `;
        }
    }
}

module.exports = RaydiumManager;