require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const WalletManager = require('./wallet-manager');
const TokenManager = require('./token-manager');
const TradingSimulator = require('./trading-simulator');
const RaydiumManager = require('./raydium-manager');
const RealTradingManager = require('./real-trading-manager');

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize Solana Connection (Devnet)
const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl('devnet'), 'confirmed');

// Initialize Wallet Manager
const walletManager = new WalletManager(connection);

// Initialize Token Manager
const tokenManager = new TokenManager(connection, walletManager);

// Initialize Trading Simulator (for backward compatibility)
const tradingSimulator = new TradingSimulator(walletManager, tokenManager);

// Initialize Raydium Manager
const raydiumManager = new RaydiumManager(connection, walletManager, tokenManager);

// Initialize Real Trading Manager
const realTradingManager = new RealTradingManager(walletManager, tokenManager, raydiumManager);

// Bot state management
const botState = {
    activeOperations: new Map(),
    currentToken: null,
    userSessions: new Map(), // Track user input sessions
    tradingMode: 'real' // 'real' or 'simulation'
};

console.log('🚀 Solana Telegram Bot Starting...');
console.log(`📡 Connected to Solana ${process.env.SOLANA_NETWORK || 'devnet'}`);

// Bot command handlers
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = `
🤖 *Solana Meme Coin Bot* - Educational Devnet Version

Available Commands:
📋 /help - Show all commands
💰 /wallets - Show wallet balances
🪂 /airdrop [wallet_number] - Request devnet SOL
🚀 /launch - Launch new meme coin
🌱 /seed_wallets - Distribute tokens to trading wallets ✅ NEW
🏊 /create_pool - Create Raydium pool ✅ NEW
📈 /start_trading - Start automated trading ✅ REAL SWAPS
⏸️ /stop_trading - Stop automated trading
🔴 /rugpull - Complete rugpull operation ✅ NEW
📊 /status - Show current operations

⚡ *Step 5 Complete:* Real Raydium DEX integration!
🎯 *Mode:* Real trading on devnet pools
    `;
    
    bot.sendMessage(chatId, welcomeMessage, { 
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '💰 Check Wallets', callback_data: 'show_wallets' },
                    { text: '🚀 Launch Coin', callback_data: 'launch_token' }
                ],
                [
                    { text: '🏊 Create Pool', callback_data: 'create_pool' },
                    { text: '📈 Start Trading', callback_data: 'start_trading' }
                ],
                [
                    { text: '⏸️ Stop Trading', callback_data: 'stop_trading' },
                    { text: '🔴 Rugpull', callback_data: 'rugpull' }
                ],
                [
                    { text: '📊 Bot Status', callback_data: 'show_status' }
                ]
            ]
        }
    });
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
📖 *Help & Commands*

*Step 1: Bot Setup* ✅
- Bot is running and connected

*Step 2: Wallet Integration* ✅
- /wallets - View all wallet balances
- /airdrop [1-5] - Request devnet SOL for testing

*Step 3: Token Launch* ✅
- /launch - Create new SPL token
- Interactive token creation process

*Step 4: Trading Simulation* ✅
- Simulation mode available for testing

*Step 5: Real Raydium Integration* ✅ COMPLETE
- /create_pool - Create Raydium liquidity pool
- /start_trading - Real automated DEX trading
- /stop_trading - Stop trading operations  
- /rugpull - Complete rugpull with liquidity removal

*Real Trading Features:*
- ⚡ Actual Raydium DEX swaps
- 🏊 Real liquidity pool creation
- 💰 70% buy / 30% sell ratio
- ⏰ Random delays (30-90 seconds)
- 🔄 Cycles through wallets 2-5
- 📊 Real-time transaction logging
- 🔗 Solana Explorer links

*Current Status:* Step 5 Complete - Real DEX trading ready!
    `;
    
    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    showStatus(chatId);
});

async function showStatus(chatId) {
    const createdTokens = tokenManager.getAllTokens();
    const createdPools = raydiumManager.getAllPools();
    const tradingStatus = realTradingManager.getTradingStatus();
    
    let tradingInfo = '❌ Not active';
    if (tradingStatus.isTrading) {
        const stats = tradingStatus.stats;
        const runtime = stats.startTime ? Math.floor((Date.now() - stats.startTime.getTime()) / 60000) : 0;
        const successRate = stats.totalTrades > 0 ? ((stats.successfulTrades / stats.totalTrades) * 100).toFixed(1) : '0';
        tradingInfo = `✅ Active (${runtime}m) - ${stats.totalTrades} trades (${successRate}% success)`;
    }
    
    const statusMessage = `
📊 *Bot Status*

🤖 Bot: Online ✅
🌐 Network: ${process.env.SOLANA_NETWORK || 'devnet'} ✅
💰 Wallets: ${walletManager.getAllWallets().length}/5 configured ✅
🪙 Tokens Created: ${createdTokens.length}
🏊 Pools Created: ${createdPools.length}
📈 Trading: ${tradingInfo}
⚡ Mode: Real DEX Trading (Step 5)

*Current Step:* Step 5 Complete - Real Raydium integration
*Features:* Pool creation, real swaps, rugpull protection
    `;
    
    bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
}

// Create Pool Command
bot.onText(/\/create_pool/, (msg) => {
    const chatId = msg.chat.id;
    createPoolCommand(chatId);  
});

function createPoolCommand(chatId) {
    const createdTokens = tokenManager.getAllTokens();
    
    if (createdTokens.length === 0) {
        bot.sendMessage(chatId, `
❌ *No Tokens Found*

You need to create a token first before creating a pool.

Use /launch to create your first token!
        `, { parse_mode: 'Markdown' });
        return;
    }

    // If only one token, create pool immediately
    if (createdTokens.length === 1) {
        const token = createdTokens[0];
        if (raydiumManager.hasPool(token.mintAddress)) {
            bot.sendMessage(chatId, `
⚠️ *Pool Already Exists*

A pool already exists for ${token.name} (${token.symbol}).

Use /start_trading to begin trading on the existing pool.
            `, { parse_mode: 'Markdown' });
            return;
        }
        createPoolForToken(chatId, token.mintAddress);
    } else {
        // Multiple tokens - let user choose
        const tokenButtons = createdTokens.map(token => {
            const hasPool = raydiumManager.hasPool(token.mintAddress);
            return [{
                text: `🏊 ${token.name} (${token.symbol}) ${hasPool ? '✅' : ''}`,
                callback_data: `create_pool_${token.mintAddress}`
            }];
        });
        
        bot.sendMessage(chatId, `
🏊 *Select Token for Pool Creation*

Choose which token you want to create a Raydium pool for:

✅ = Pool already exists
        `, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    ...tokenButtons,
                    [{ text: '❌ Cancel', callback_data: 'cancel_pool_creation' }]
                ]
            }
        });
    }
}

async function createPoolForToken(chatId, tokenMint) {
    const tokenInfo = tokenManager.getToken(tokenMint);
    if (!tokenInfo) {
        bot.sendMessage(chatId, '❌ Token not found');
        return;
    }

    if (raydiumManager.hasPool(tokenMint)) {
        bot.sendMessage(chatId, `
⚠️ *Pool Already Exists*

A pool already exists for ${tokenInfo.name} (${tokenInfo.symbol}).
        `, { parse_mode: 'Markdown' });
        return;
    }

    try {
        bot.sendMessage(chatId, `
🔄 *Creating Raydium Pool...*

🪙 Token: ${tokenInfo.name} (${tokenInfo.symbol})
💰 Initial Liquidity: 0.5 SOL + 500 ${tokenInfo.symbol}
🏊 Creating pool on Raydium devnet...

This may take 30-60 seconds...
        `, { parse_mode: 'Markdown' });

        const result = await raydiumManager.createPool(tokenMint, 0.5);
        
        if (result.success) {
            const poolMessage = raydiumManager.formatPoolForTelegram(result.poolInfo, tokenInfo);
            
            bot.sendMessage(chatId, poolMessage, { 
                parse_mode: 'Markdown',
                disable_web_page_preview: false,
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📈 Start Trading', callback_data: `trade_token_${tokenMint}` },
                            { text: '📊 View Pool', callback_data: `view_pool_${tokenMint}` }
                        ]
                    ]
                }
            });
        } else {
            bot.sendMessage(chatId, `❌ Pool creation failed: ${result.error}`);
        }
    } catch (error) {
        console.error('❌ Pool creation error:', error);
        bot.sendMessage(chatId, `❌ Pool creation failed: ${error.message}`);
    }
}

// Start Trading Command (Real Trading)
bot.onText(/\/start_trading/, (msg) => {
    const chatId = msg.chat.id;
    startRealTradingCommand(chatId);
});

function startRealTradingCommand(chatId) {
    const createdPools = raydiumManager.getAllPools();
    
    if (createdPools.length === 0) {
        bot.sendMessage(chatId, `
❌ *No Pools Found*

You need to create a pool first before starting trading.

Steps:
1. Use /launch to create a token
2. Use /create_pool to create a Raydium pool
3. Then start trading!
        `, { parse_mode: 'Markdown' });
        return;
    }

    if (realTradingManager.getTradingStatus().isTrading) {
        bot.sendMessage(chatId, `
⚠️ *Trading Already Active*

Real trading is already running. Use /stop_trading to stop it first.
        `, { parse_mode: 'Markdown' });
        return;
    }

    // If only one pool, start trading immediately
    if (createdPools.length === 1) {
        startRealTradingForToken(chatId, createdPools[0].tokenMint);
    } else {
        // Multiple pools - let user choose
        const poolButtons = createdPools.map(pool => {
            const tokenInfo = tokenManager.getToken(pool.tokenMint);
            return [{
                text: `⚡ ${tokenInfo ? tokenInfo.name : 'Unknown'} (${tokenInfo ? tokenInfo.symbol : 'TOKEN'})`,
                callback_data: `real_trade_token_${pool.tokenMint}`
            }];
        });
        
        bot.sendMessage(chatId, `
📈 *Select Pool for Real Trading*

Choose which pool you want to trade on:
        `, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    ...poolButtons,
                    [{ text: '❌ Cancel', callback_data: 'cancel_trading' }]
                ]
            }
        });
    }
}

function startRealTradingForToken(chatId, tokenMint) {
    const tokenInfo = tokenManager.getToken(tokenMint);
    if (!tokenInfo) {
        bot.sendMessage(chatId, '❌ Token not found');
        return;
    }

    // Start real trading with callback for trade notifications
    const result = realTradingManager.startTrading(tokenMint, (tradeResult) => {
        // Send trade notification to Telegram
        const tradeMessage = realTradingManager.formatTradeForTelegram(tradeResult);
        bot.sendMessage(chatId, tradeMessage, { parse_mode: 'Markdown' });
    });

    if (result.success) {
        bot.sendMessage(chatId, `
🚀 *Real Automated Trading Started!*

🪙 Token: ${tokenInfo.name} (${tokenInfo.symbol})
⚡ Mode: **REAL RAYDIUM DEX SWAPS**
🎯 Strategy: 70% Buy / 30% Sell
⏰ Intervals: 30-90 seconds (random)
💰 Wallets: 2, 3, 4, 5 (cycling)
🌐 Network: Solana Devnet

⚠️ **This uses real transactions on devnet!**
First trade will execute in 5-15 seconds...
        `, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '⏸️ Stop Trading', callback_data: 'stop_trading' },
                        { text: '📊 View Status', callback_data: 'show_status' }
                    ]
                ]
            }
        });
    } else {
        bot.sendMessage(chatId, `❌ Failed to start real trading: ${result.error}`);
    }
}

// Stop Trading Command (Real Trading)
bot.onText(/\/stop_trading/, (msg) => {
    const chatId = msg.chat.id;
    stopRealTradingCommand(chatId);
});

function stopRealTradingCommand(chatId) {
    const result = realTradingManager.stopTrading();
    
    if (result.success) {
        const stats = result.stats;
        const runtime = stats.startTime ? Math.floor((Date.now() - stats.startTime.getTime()) / 60000) : 0;
        const successRate = stats.totalTrades > 0 ? ((stats.successfulTrades / stats.totalTrades) * 100).toFixed(1) : '0';
        
        bot.sendMessage(chatId, `
⏸️ *Real Trading Stopped*

📊 *Session Statistics:*
⏰ Runtime: ${runtime} minutes
📈 Total Trades: ${stats.totalTrades}
✅ Successful: ${stats.successfulTrades}
❌ Failed: ${stats.failedTrades}
🟢 Buy Trades: ${stats.buyTrades}
🔴 Sell Trades: ${stats.sellTrades}
💹 Success Rate: ${successRate}%

All real trading operations have been halted.
        `, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(chatId, `❌ ${result.error}`);
    }
}

// Rugpull Command (Real Rugpull)
bot.onText(/\/rugpull/, (msg) => {
    const chatId = msg.chat.id;
    realRugpullCommand(chatId);
});

function realRugpullCommand(chatId) {
    const createdPools = raydiumManager.getAllPools();
    
    if (createdPools.length === 0) {
        bot.sendMessage(chatId, `
❌ *No Pools Found*

You need to create a pool first before rugpulling.

Steps:
1. Use /launch to create a token
2. Use /create_pool to create a Raydium pool
3. Then you can rugpull!
        `, { parse_mode: 'Markdown' });
        return;
    }

    // If trading is active, warn user
    if (realTradingManager.getTradingStatus().isTrading) {
        bot.sendMessage(chatId, `
⚠️ *Warning: Trading is Active*

Stop trading first with /stop_trading, then proceed with rugpull.
        `, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '⏸️ Stop Trading First', callback_data: 'stop_trading' },
                        { text: '🔴 Rugpull Anyway', callback_data: 'force_rugpull' }
                    ]
                ]
            }
        });
        return;
    }

    // If only one pool, show rugpull confirmation
    if (createdPools.length === 1) {
        const pool = createdPools[0];
        const tokenInfo = tokenManager.getToken(pool.tokenMint);
        
        bot.sendMessage(chatId, `
🔴 *Confirm Rugpull Operation*

⚠️ **WARNING: This will:**
1. Sell ALL tokens from wallets 2-5
2. Remove ALL liquidity from the pool
3. Return all SOL to wallet 1

🪙 Pool: ${tokenInfo ? tokenInfo.name : 'Unknown'} (${tokenInfo ? tokenInfo.symbol : 'TOKEN'})
🏊 Pool ID: \`${pool.poolId}\`

**This action cannot be undone!**
        `, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🔴 CONFIRM RUGPULL', callback_data: `confirm_rugpull_${pool.tokenMint}` }
                    ],
                    [
                        { text: '❌ Cancel', callback_data: 'cancel_rugpull' }
                    ]
                ]
            }
        });
    } else {
        // Multiple pools - let user choose
        const poolButtons = createdPools.map(pool => {
            const tokenInfo = tokenManager.getToken(pool.tokenMint);
            return [{
                text: `🔴 ${tokenInfo ? tokenInfo.name : 'Unknown'} (${tokenInfo ? tokenInfo.symbol : 'TOKEN'})`,
                callback_data: `rugpull_pool_${pool.tokenMint}`
            }];
        });
        
        bot.sendMessage(chatId, `
🔴 *Select Pool to Rugpull*

⚠️ WARNING: This will sell ALL tokens and remove liquidity!

Choose which pool to rugpull:
        `, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    ...poolButtons,
                    [{ text: '❌ Cancel', callback_data: 'cancel_rugpull' }]
                ]
            }
        });
    }
}

async function executeRealRugpull(chatId, tokenMint) {
    const tokenInfo = tokenManager.getToken(tokenMint);
    if (!tokenInfo) {
        bot.sendMessage(chatId, '❌ Token not found');
        return;
    }

    // Stop trading if active
    if (realTradingManager.getTradingStatus().isTrading) {
        realTradingManager.stopTrading();
    }

    try {
        bot.sendMessage(chatId, `
🔄 *Executing Real Rugpull...*

🔴 Step 1: Selling tokens from all trading wallets...
🔴 Step 2: Removing liquidity from pool...
🔴 Step 3: Returning SOL to wallet 1...

⚠️ **This involves real transactions on devnet!**
This may take 60-120 seconds...
        `, { parse_mode: 'Markdown' });

        const result = await realTradingManager.executeRugpull(tokenMint);
        
        if (result.success) {
            bot.sendMessage(chatId, `
🔴 *RUGPULL EXECUTED!* ⚡ REAL TRANSACTIONS

🪙 Token: ${tokenInfo.name} (${tokenInfo.symbol})
💰 Tokens Sold: ${result.totalTokensSold.toFixed(2)} ${tokenInfo.symbol}
💸 SOL Recovered: ${result.totalSOLRecovered.toFixed(4)} SOL
🏊 Liquidity Removed: ${result.liquidityRemoved ? '✅' : '❌'}
📊 Wallet Sales: ${result.tradingWalletSales}

💰 All SOL has been returned to Wallet 1
🏊 Pool has been destroyed

**Rugpull complete - all assets recovered!**
            `, { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💰 Check Wallet 1 Balance', callback_data: 'show_wallets' }]
                    ]
                }
            });
        } else {
            bot.sendMessage(chatId, `❌ Rugpull failed: ${result.error}`);
        }
    } catch (error) {
        console.error('❌ Rugpull execution error:', error);
        bot.sendMessage(chatId, `❌ Rugpull execution failed: ${error.message}`);
    }
}

// Updated wallets command with real functionality
bot.onText(/\/wallets/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        bot.sendMessage(chatId, '🔄 Fetching wallet balances...');
        
        const walletMessage = await walletManager.formatAllWalletsForTelegram();
        
        bot.sendMessage(chatId, walletMessage, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🔄 Refresh Balances', callback_data: 'refresh_wallets' },
                        { text: '🪂 Request Airdrop', callback_data: 'airdrop_menu' }
                    ],
                    [
                        { text: '🏊 View Pools', callback_data: 'view_all_pools' }
                    ]
                ]
            }
        });
    } catch (error) {
        console.error('❌ Error fetching wallets:', error);
        bot.sendMessage(chatId, '❌ Error fetching wallet information. Please try again.');
    }
});

// Launch command - Start token creation process
bot.onText(/\/launch/, (msg) => {
    const chatId = msg.chat.id;
    startTokenCreation(chatId, msg.from.id);
});

function startTokenCreation(chatId, userId) {
    // Initialize user session
    botState.userSessions.set(userId, {
        step: 'waiting_for_name',
        chatId: chatId,
        tokenData: {}
    });

    const message = `
🚀 *Create New Meme Coin*

Let's launch your token on Solana devnet!

*Step 1/3:* Please enter your token name
(Example: "Doge Killer", "Moon Token")

💡 *Tips:*
- Keep it catchy and memorable
- Max 32 characters
- Can include spaces and special characters
    `;

    bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '❌ Cancel', callback_data: 'cancel_launch' }]
            ]
        }
    });
}

// Handle text messages for token creation flow
bot.on('message', (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const text = msg.text;

    // Skip if message starts with / (command)
    if (text && text.startsWith('/')) {
        return;
    }

    // Check if user is in token creation flow
    const session = botState.userSessions.get(userId);
    if (!session) {
        return;
    }

    handleTokenCreationInput(userId, chatId, text, session);
});

async function handleTokenCreationInput(userId, chatId, text, session) {
    try {
        switch (session.step) {
            case 'waiting_for_name':
                const nameErrors = tokenManager.validateTokenParams(text, 'TEMP', 1000000);
                const nameSpecificErrors = nameErrors.filter(err => err.includes('name'));
                
                if (nameSpecificErrors.length > 0) {
                    bot.sendMessage(chatId, `❌ ${nameSpecificErrors.join('\n')}\n\nPlease try again:`);
                    return;
                }

                session.tokenData.name = text.trim();
                session.step = 'waiting_for_symbol';
                
                bot.sendMessage(chatId, `
✅ Token Name: *${text.trim()}*

*Step 2/3:* Please enter your token symbol/ticker
(Example: "DOGE", "MOON", "PEPE")

💡 *Tips:*
- Usually 3-6 characters
- All CAPS recommended
- Letters and numbers only
- Max 10 characters
                `, { 
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '❌ Cancel', callback_data: 'cancel_launch' }]
                        ]
                    }
                });
                break;

            case 'waiting_for_symbol':
                const symbolErrors = tokenManager.validateTokenParams('Test', text, 1000000);
                const symbolSpecificErrors = symbolErrors.filter(err => err.includes('symbol'));
                
                if (symbolSpecificErrors.length > 0) {
                    bot.sendMessage(chatId, `❌ ${symbolSpecificErrors.join('\n')}\n\nPlease try again:`);
                    return;
                }

                session.tokenData.symbol = text.trim().toUpperCase();
                session.step = 'waiting_for_supply';
                
                bot.sendMessage(chatId, `
✅ Token Symbol: *${text.trim().toUpperCase()}*

*Step 3/3:* Please enter the total supply
(Example: "1000000", "100000000")

💡 *Tips:*
- Numbers only (no commas)
- Max 1 trillion (1000000000000)
- Will be minted to Wallet 1
- Cannot be changed later
                `, { 
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '❌ Cancel', callback_data: 'cancel_launch' }]
                        ]
                    }
                });
                break;

            case 'waiting_for_supply':
                const supply = parseFloat(text.trim());
                const supplyErrors = tokenManager.validateTokenParams('Test', 'TEST', supply);
                const supplySpecificErrors = supplyErrors.filter(err => err.includes('supply'));
                
                if (supplySpecificErrors.length > 0) {
                    bot.sendMessage(chatId, `❌ ${supplySpecificErrors.join('\n')}\n\nPlease try again:`);
                    return;
                }

                session.tokenData.supply = supply;
                
                // Show confirmation
                const confirmMessage = `
🎯 *Confirm Token Creation*

📛 *Name:* ${session.tokenData.name}
🏷️ *Symbol:* ${session.tokenData.symbol}
🪙 *Total Supply:* ${supply.toLocaleString()} ${session.tokenData.symbol}
💰 *Mint to:* Wallet 1
🌐 *Network:* Solana Devnet

Ready to create your token?
                `;

                bot.sendMessage(chatId, confirmMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🚀 Create Token', callback_data: 'confirm_create_token' },
                                { text: '❌ Cancel', callback_data: 'cancel_launch' }
                            ]
                        ]
                    }
                });
                
                session.step = 'waiting_for_confirmation';
                break;
        }

        // Update session
        botState.userSessions.set(userId, session);

    } catch (error) {
        console.error('❌ Error handling token creation input:', error);
        bot.sendMessage(chatId, '❌ Something went wrong. Please try again with /launch');
        botState.userSessions.delete(userId);
    }
}

// Airdrop command
bot.onText(/\/airdrop(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const walletNumber = match[1] ? parseInt(match[1]) : null;
    
    if (!walletNumber || walletNumber < 1 || walletNumber > 5) {
        bot.sendMessage(chatId, `
🪂 *Airdrop Command*

Usage: \`/airdrop [wallet_number]\`

Example: \`/airdrop 1\` - Request 1 SOL for wallet 1

Valid wallet numbers: 1-5
        `, { parse_mode: 'Markdown' });
        return;
    }
    
    try {
        bot.sendMessage(chatId, `🪂 Requesting devnet SOL airdrop for wallet ${walletNumber}...`);
        
        const result = await walletManager.requestAirdrop(walletNumber, 1);
        
        if (result.success) {
            bot.sendMessage(chatId, `
✅ *Airdrop Successful!*

💰 Wallet ${walletNumber} received 1 SOL
🔗 Transaction: \`${result.signature}\`
💵 New Balance: *${result.newBalance.toFixed(4)} SOL*
            `, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, `❌ Airdrop failed: ${result.error}`);
        }
    } catch (error) {
        console.error('❌ Airdrop error:', error);
        bot.sendMessage(chatId, '❌ Airdrop request failed. Please try again.');
    }
});

// Callback query handler for inline buttons
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = message.chat.id;
    const userId = callbackQuery.from.id;
    
    if (data === 'refresh_wallets') {
        try {
            const walletMessage = await walletManager.formatAllWalletsForTelegram();
            
            bot.editMessageText(walletMessage, {
                chat_id: chatId,
                message_id: message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔄 Refresh Balances', callback_data: 'refresh_wallets' },
                            { text: '🪂 Request Airdrop', callback_data: 'airdrop_menu' }
                        ],
                        [
                            { text: '🏊 View Pools', callback_data: 'view_all_pools' }
                        ]
                    ]
                }
            });
            
            bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Balances refreshed!' });
        } catch (error) {
            bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Refresh failed' });
        }
    } else if (data === 'view_all_pools') {
        const pools = raydiumManager.getAllPools();
        
        if (pools.length === 0) {
            bot.sendMessage(chatId, '❌ No pools created yet. Use /create_pool to create your first pool!');
        } else {
            let poolsMessage = `🏊 *Created Pools* (${pools.length})\n\n`;
            
            pools.forEach((pool, index) => {
                const tokenInfo = tokenManager.getToken(pool.tokenMint);
                poolsMessage += `${index + 1}. *${tokenInfo ? tokenInfo.name : 'Unknown'}* (${tokenInfo ? tokenInfo.symbol : 'TOKEN'})\n`;
                poolsMessage += `   Pool ID: \`${pool.poolId.substring(0, 8)}...\`\n`;
                poolsMessage += `   Liquidity: ${pool.solAmount} SOL + ${pool.liquidityAmount} tokens\n\n`;
            });
            
            bot.sendMessage(chatId, poolsMessage, { parse_mode: 'Markdown' });
        }
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data === 'airdrop_menu') {
        const airdropMessage = `
🪂 *Request Devnet SOL*

Choose a wallet to request 1 SOL airdrop:
        `;
        
        bot.sendMessage(chatId, airdropMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '💰 Wallet 1', callback_data: 'airdrop_1' },
                        { text: '💰 Wallet 2', callback_data: 'airdrop_2' }
                    ],
                    [
                        { text: '💰 Wallet 3', callback_data: 'airdrop_3' },
                        { text: '💰 Wallet 4', callback_data: 'airdrop_4' }
                    ],
                    [
                        { text: '💰 Wallet 5', callback_data: 'airdrop_5' }
                    ]
                ]
            }
        });
        
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data.startsWith('airdrop_')) {
        const walletNumber = parseInt(data.split('_')[1]);
        
        try {
            bot.answerCallbackQuery(callbackQuery.id, { text: `🪂 Requesting airdrop for wallet ${walletNumber}...` });
            
            const result = await walletManager.requestAirdrop(walletNumber, 1);
            
            if (result.success) {
                bot.sendMessage(chatId, `
✅ *Airdrop Successful!*

💰 Wallet ${walletNumber} received 1 SOL
🔗 Transaction: \`${result.signature}\`
💵 New Balance: *${result.newBalance.toFixed(4)} SOL*
                `, { parse_mode: 'Markdown' });
            } else {
                bot.sendMessage(chatId, `❌ Airdrop failed for wallet ${walletNumber}: ${result.error}`);
            }
        } catch (error) {
            bot.sendMessage(chatId, `❌ Airdrop error for wallet ${walletNumber}`);
        }
    } else if (data === 'show_wallets') {
        try {
            bot.sendMessage(chatId, '🔄 Fetching wallet balances...');
            
            const walletMessage = await walletManager.formatAllWalletsForTelegram();
            
            bot.sendMessage(chatId, walletMessage, { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔄 Refresh Balances', callback_data: 'refresh_wallets' },
                            { text: '🪂 Request Airdrop', callback_data: 'airdrop_menu' }
                        ],
                        [
                            { text: '🏊 View Pools', callback_data: 'view_all_pools' }
                        ]
                    ]
                }
            });
        } catch (error) {
            bot.sendMessage(chatId, '❌ Error fetching wallet information. Please try again.');
        }
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data === 'show_status') {
        await showStatus(chatId);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data === 'launch_token') {
        startTokenCreation(chatId, userId);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data === 'create_pool') {
        createPoolCommand(chatId);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data === 'start_trading') {
        startRealTradingCommand(chatId);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data === 'stop_trading') {
        stopRealTradingCommand(chatId);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data === 'rugpull' || data === 'force_rugpull') {
        realRugpullCommand(chatId);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data.startsWith('create_pool_')) {
        const tokenMint = data.replace('create_pool_', '');
        await createPoolForToken(chatId, tokenMint);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data.startsWith('real_trade_token_')) {
        const tokenMint = data.replace('real_trade_token_', '');
        startRealTradingForToken(chatId, tokenMint);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data.startsWith('trade_token_')) {
        const tokenMint = data.replace('trade_token_', '');
        startRealTradingForToken(chatId, tokenMint);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data.startsWith('rugpull_pool_')) {
        const tokenMint = data.replace('rugpull_pool_', '');
        // Show confirmation for this specific pool
        const poolInfo = raydiumManager.getPoolInfo(tokenMint);
        const tokenInfo = tokenManager.getToken(tokenMint);
        
        bot.sendMessage(chatId, `
🔴 *Confirm Rugpull Operation*

⚠️ **WARNING: This will:**
1. Sell ALL tokens from wallets 2-5
2. Remove ALL liquidity from the pool  
3. Return all SOL to wallet 1

🪙 Token: ${tokenInfo ? tokenInfo.name : 'Unknown'} (${tokenInfo ? tokenInfo.symbol : 'TOKEN'})
🏊 Pool ID: \`${poolInfo ? poolInfo.poolId : 'Unknown'}\`

**This action cannot be undone!**
        `, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🔴 CONFIRM RUGPULL', callback_data: `confirm_rugpull_${tokenMint}` }
                    ],
                    [
                        { text: '❌ Cancel', callback_data: 'cancel_rugpull' }
                    ]
                ]
            }
        });
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data.startsWith('confirm_rugpull_')) {
        const tokenMint = data.replace('confirm_rugpull_', '');
        await executeRealRugpull(chatId, tokenMint);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data === 'cancel_trading' || data === 'cancel_rugpull' || data === 'cancel_pool_creation') {
        bot.sendMessage(chatId, '❌ Operation cancelled.');
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data === 'cancel_launch') {
        botState.userSessions.delete(userId);
        bot.sendMessage(chatId, '❌ Token creation cancelled.');
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data === 'confirm_create_token') {
        const session = botState.userSessions.get(userId);
        if (!session || !session.tokenData) {
            bot.sendMessage(chatId, '❌ Session expired. Please start again with /launch');
            bot.answerCallbackQuery(callbackQuery.id);
            return;
        }

        try {
            bot.answerCallbackQuery(callbackQuery.id, { text: '🚀 Creating token...' });
            bot.sendMessage(chatId, '🔄 *Creating your token...* This may take 30-60 seconds.', { parse_mode: 'Markdown' });

            const tokenInfo = await tokenManager.createToken(
                session.tokenData.name,
                session.tokenData.symbol,
                session.tokenData.supply,
                userId
            );

            const tokenMessage = tokenManager.formatTokenForTelegram(tokenInfo);
            
            bot.sendMessage(chatId, tokenMessage, { 
                parse_mode: 'Markdown',
                disable_web_page_preview: false,
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🏊 Create Pool', callback_data: `create_pool_${tokenInfo.mintAddress}` },
                            { text: '📊 Bot Status', callback_data: 'show_status' }
                        ]
                    ]
                }
            });

            // Clean up session
            botState.userSessions.delete(userId);
            
        } catch (error) {
            console.error('❌ Token creation error:', error);
            bot.sendMessage(chatId, `❌ Token creation failed: ${error.message}\n\nPlease try again with /launch`);
            botState.userSessions.delete(userId);
        }
    }
});

// Test Solana connection
async function testSolanaConnection() {
    try {
        const version = await connection.getVersion();
        console.log('✅ Solana connection successful:', version);
        return true;
    } catch (error) {
        console.error('❌ Solana connection failed:', error.message);
        return false;
    }
}

// Initialize bot
async function initializeBot() {
    console.log('🔄 Testing connections...');
    
    // Test Solana connection
    const solanaConnected = await testSolanaConnection();
    
    if (solanaConnected) {
        console.log('✅ All connections successful!');
        console.log('📱 Bot is ready for Telegram commands');
        console.log('💬 Send /start to your bot to begin');
        
        // Test wallet initialization
        const summary = await walletManager.getWalletSummary();
        console.log(`💼 Wallet Summary: ${summary.totalWallets} wallets, ${summary.totalBalance.toFixed(4)} SOL total`);
    } else {
        console.log('⚠️ Some connections failed, but bot will still start');
    }
}

// Error handling
bot.on('error', (error) => {
    console.error('❌ Telegram Bot Error:', error);
});

bot.on('polling_error', (error) => {
    console.error('❌ Polling Error:', error);
});

// Start the bot
initializeBot();

console.log('🎯 Step 5 Complete: Real Raydium DEX Integration Ready');
console.log('⏳ Waiting for user testing of pool creation and real trading...');