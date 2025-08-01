require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const WalletManager = require('./wallet-manager');
const TokenManager = require('./token-manager');
const TradingSimulator = require('./trading-simulator');

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize Solana Connection (Devnet)
const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl('devnet'), 'confirmed');

// Initialize Wallet Manager
const walletManager = new WalletManager(connection);

// Initialize Token Manager
const tokenManager = new TokenManager(connection, walletManager);

// Initialize Trading Simulator
const tradingSimulator = new TradingSimulator(walletManager, tokenManager);

// Bot state management
const botState = {
    activeOperations: new Map(),
    currentToken: null,
    userSessions: new Map() // Track user input sessions
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
📈 /start_trading - Start automated trading ✅ NEW
⏸️ /stop_trading - Stop automated trading ✅ NEW
🔴 /rugpull - Sell all holdings ✅ NEW
📊 /status - Show current operations

⚠️ *Educational Use Only* - Devnet Testing
🎯 *Step 4 Complete:* Automated trading simulation ready!
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
                    { text: '📈 Start Trading', callback_data: 'start_trading' },
                    { text: '⏸️ Stop Trading', callback_data: 'stop_trading' }
                ],
                [
                    { text: '🔴 Rugpull', callback_data: 'rugpull' },
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

*Step 4: Automated Trading* ✅ COMPLETE
- /start_trading - Begin automated trading simulation
- /stop_trading - Stop trading operations  
- /rugpull - Sell all tokens and recover SOL

*Trading Features:*
- 70% buy / 30% sell ratio
- Random delays (45-120 seconds)
- Cycles through wallets 2-5
- Real-time trade logging
- Balance tracking

*Current Status:* Step 4 Complete - Ready for automated trading!
*Next:* Step 5 will connect to real Raydium pools
    `;
    
    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    showStatus(chatId);
});

async function showStatus(chatId) {
    const createdTokens = tokenManager.getAllTokens();
    const tradingStatus = tradingSimulator.getTradingStatus();
    
    let tradingInfo = '❌ Not active';
    if (tradingStatus.isTrading) {
        const stats = tradingStatus.stats;
        const runtime = stats.startTime ? Math.floor((Date.now() - stats.startTime.getTime()) / 60000) : 0;
        tradingInfo = `✅ Active (${runtime}m) - ${stats.totalTrades} trades`;
    }
    
    const statusMessage = `
📊 *Bot Status*

🤖 Bot: Online ✅
🌐 Network: ${process.env.SOLANA_NETWORK || 'devnet'} ✅
💰 Wallets: ${walletManager.getAllWallets().length}/5 configured ✅
🪙 Tokens Created: ${createdTokens.length}
📈 Trading: ${tradingInfo}
🎯 Mode: Simulation (Step 4)

*Current Step:* Step 4 Complete - Automated trading simulation
*Next Step:* Step 5 - Real Raydium pool integration
    `;
    
    bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
}

// Start Trading Command
bot.onText(/\/start_trading/, (msg) => {
    const chatId = msg.chat.id;
    startTradingCommand(chatId);
});

function startTradingCommand(chatId) {
    const createdTokens = tokenManager.getAllTokens();
    
    if (createdTokens.length === 0) {
        bot.sendMessage(chatId, `
❌ *No Tokens Found*

You need to create a token first before starting trading.

Use /launch to create your first token!
        `, { parse_mode: 'Markdown' });
        return;
    }

    if (tradingSimulator.getTradingStatus().isTrading) {
        bot.sendMessage(chatId, `
⚠️ *Trading Already Active*

Trading is already running. Use /stop_trading to stop it first.
        `, { parse_mode: 'Markdown' });
        return;
    }

    // If only one token, start trading immediately
    if (createdTokens.length === 1) {
        startTradingForToken(chatId, createdTokens[0].mintAddress);
    } else {
        // Multiple tokens - let user choose
        const tokenButtons = createdTokens.map(token => [{
            text: `🪙 ${token.name} (${token.symbol})`,
            callback_data: `trade_token_${token.mintAddress}`
        }]);
        
        bot.sendMessage(chatId, `
📈 *Select Token for Trading*

Choose which token you want to trade:
        `, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    ...tokenButtons,
                    [{ text: '❌ Cancel', callback_data: 'cancel_trading' }]
                ]
            }
        });
    }
}

function startTradingForToken(chatId, tokenMint) {
    const tokenInfo = tokenManager.getToken(tokenMint);
    if (!tokenInfo) {
        bot.sendMessage(chatId, '❌ Token not found');
        return;
    }

    // Start trading with callback for trade notifications
    const result = tradingSimulator.startTrading(tokenMint, (tradeResult) => {
        // Send trade notification to Telegram
        const tradeMessage = tradingSimulator.formatTradeForTelegram(tradeResult);
        bot.sendMessage(chatId, tradeMessage, { parse_mode: 'Markdown' });
    });

    if (result.success) {
        bot.sendMessage(chatId, `
🚀 *Automated Trading Started!*

🪙 Token: ${tokenInfo.name} (${tokenInfo.symbol})
🎯 Strategy: 70% Buy / 30% Sell
⏰ Intervals: 45-120 seconds (random)
💰 Wallets: 2, 3, 4, 5 (cycling)
🎮 Mode: Simulation

First trade will execute in 5-15 seconds...
        `, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '⏸️ Stop Trading', callback_data: 'stop_trading' },
                        { text: '📊 View Balances', callback_data: 'view_sim_balances' }
                    ]
                ]
            }
        });
    } else {
        bot.sendMessage(chatId, `❌ Failed to start trading: ${result.error}`);
    }
}

// Stop Trading Command
bot.onText(/\/stop_trading/, (msg) => {
    const chatId = msg.chat.id;
    stopTradingCommand(chatId);
});

function stopTradingCommand(chatId) {
    const result = tradingSimulator.stopTrading();
    
    if (result.success) {
        const stats = result.stats;
        const runtime = stats.startTime ? Math.floor((Date.now() - stats.startTime.getTime()) / 60000) : 0;
        
        bot.sendMessage(chatId, `
⏸️ *Trading Stopped*

📊 *Session Statistics:*
⏰ Runtime: ${runtime} minutes
📈 Total Trades: ${stats.totalTrades}
🟢 Buy Trades: ${stats.buyTrades}
🔴 Sell Trades: ${stats.sellTrades}
💹 Success Rate: 100% (simulated)

All trading operations have been halted.
        `, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(chatId, `❌ ${result.error}`);
    }
}

// Rugpull Command
bot.onText(/\/rugpull/, (msg) => {
    const chatId = msg.chat.id;
    rugpullCommand(chatId);
});

function rugpullCommand(chatId) {
    const createdTokens = tokenManager.getAllTokens();
    
    if (createdTokens.length === 0) {
        bot.sendMessage(chatId, `
❌ *No Tokens Found*

You need to create a token first before rugpulling.

Use /launch to create your first token!
        `, { parse_mode: 'Markdown' });
        return;
    }

    // If trading is active, stop it first
    if (tradingSimulator.getTradingStatus().isTrading) {
        tradingSimulator.stopTrading();
    }

    // If only one token, rugpull immediately
    if (createdTokens.length === 1) {
        executeRugpull(chatId, createdTokens[0].mintAddress);
    } else {
        // Multiple tokens - let user choose
        const tokenButtons = createdTokens.map(token => [{
            text: `🔴 ${token.name} (${token.symbol})`,
            callback_data: `rugpull_token_${token.mintAddress}`
        }]);
        
        bot.sendMessage(chatId, `
🔴 *Select Token to Rugpull*

⚠️ WARNING: This will sell ALL tokens from wallets 2-5 and return SOL to wallet 1.

Choose which token to rugpull:
        `, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    ...tokenButtons,
                    [{ text: '❌ Cancel', callback_data: 'cancel_rugpull' }]
                ]
            }
        });
    }
}

function executeRugpull(chatId, tokenMint) {
    const tokenInfo = tokenManager.getToken(tokenMint);
    if (!tokenInfo) {
        bot.sendMessage(chatId, '❌ Token not found');
        return;
    }

    bot.sendMessage(chatId, `🔄 *Executing Rugpull...* (Simulated)`, { parse_mode: 'Markdown' });

    const result = tradingSimulator.rugpull(tokenMint);
    
    if (result.success) {
        bot.sendMessage(chatId, `
🔴 *RUGPULL EXECUTED!* (Simulated)

🪙 Token: ${tokenInfo.name} (${tokenInfo.symbol})
💰 Tokens Sold: ${result.totalTokensSold.toFixed(2)} ${tokenInfo.symbol}
💸 SOL Recovered: ${result.totalSOLRecovered.toFixed(4)} SOL
📊 Trades Executed: ${result.tradesExecuted}

💰 *Wallet 1 New Balance:* ${result.newWallet1SOLBalance.toFixed(4)} SOL

All tokens have been sold and SOL returned to Wallet 1.
        `, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📊 View All Balances', callback_data: 'view_sim_balances' }]
                ]
            }
        });
    } else {
        bot.sendMessage(chatId, `❌ Rugpull failed: ${result.error}`);
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
                        { text: '🎮 View Simulated Balances', callback_data: 'view_sim_balances' }
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
                            { text: '🎮 View Simulated Balances', callback_data: 'view_sim_balances' }
                        ]
                    ]
                }
            });
            
            bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Balances refreshed!' });
        } catch (error) {
            bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Refresh failed' });
        }
    } else if (data === 'view_sim_balances') {
        const balances = tradingSimulator.getBalancesSummary();
        const createdTokens = tokenManager.getAllTokens();
        
        let message = `🎮 *Simulated Balances*\n\n💰 *SOL Balances:*\n`;
        for (let walletId = 1; walletId <= 5; walletId++) {
            message += `Wallet ${walletId}: ${balances.solBalances[walletId].toFixed(4)} SOL\n`;
        }
        
        if (createdTokens.length > 0) {
            message += `\n🪙 *Token Balances:*\n`;
            createdTokens.forEach(token => {
                if (balances.tokenBalances[token.mintAddress]) {
                    message += `\n*${token.symbol}:*\n`;
                    for (let walletId = 1; walletId <= 5; walletId++) {
                        const balance = balances.tokenBalances[token.mintAddress][walletId] || 0;
                        message += `Wallet ${walletId}: ${balance.toFixed(2)} ${token.symbol}\n`;
                    }
                }
            });
        }
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
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
                            { text: '🎮 View Simulated Balances', callback_data: 'view_sim_balances' }
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
    } else if (data === 'start_trading') {
        startTradingCommand(chatId);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data === 'stop_trading') {
        stopTradingCommand(chatId);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data === 'rugpull') {
        rugpullCommand(chatId);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data.startsWith('trade_token_')) {
        const tokenMint = data.replace('trade_token_', '');
        startTradingForToken(chatId, tokenMint);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data.startsWith('rugpull_token_')) {
        const tokenMint = data.replace('rugpull_token_', '');
        executeRugpull(chatId, tokenMint);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data === 'cancel_trading' || data === 'cancel_rugpull') {
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
                disable_web_page_preview: false
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

console.log('🎯 Step 4 Complete: Automated Trading Controls Ready');
console.log('⏳ Waiting for user confirmation to proceed to Step 5...');