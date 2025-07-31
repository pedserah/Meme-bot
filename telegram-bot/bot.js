require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const WalletManager = require('./wallet-manager');

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize Solana Connection (Devnet)
const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl('devnet'), 'confirmed');

// Initialize Wallet Manager
const walletManager = new WalletManager(connection);

// Bot state management
const botState = {
    activeOperations: new Map(),
    currentToken: null
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
💰 /wallets - Show wallet balances ✅ NEW
🪂 /airdrop [wallet_number] - Request devnet SOL
🚀 /launch - Launch new meme coin (Step 3)
📊 /status - Show current operations
⏸️ /pause - Pause automated buying
🔴 /rugpull - Sell all holdings (Step 4)

⚠️ *Educational Use Only* - Devnet Testing

*Step 2 Complete:* 5 wallets integrated with real balances!
    `;
    
    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
📖 *Help & Commands*

*Step 1: Bot Setup* ✅
- Bot is running and connected

*Step 2: Wallet Integration* ✅ COMPLETE
- /wallets - View all wallet balances
- /airdrop [1-5] - Request devnet SOL for testing
- 5 wallets derived from your mnemonics

*Step 3: Token Launch* (Coming Next)  
- /launch - Create new meme coin
- Raydium integration

*Step 4: Trading Operations* (Coming Next)
- Automated buying with random intervals
- /pause - Stop buying
- /rugpull - Emergency sell

*Current Status:* Step 2 Complete - Wallets ready for testing
    `;
    
    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    const statusMessage = `
📊 *Bot Status*

🤖 Bot: Online ✅
🌐 Network: ${process.env.SOLANA_NETWORK || 'devnet'} ✅
💰 Wallets: ${walletManager.getAllWallets().length}/5 configured ✅
🚀 Raydium: Not integrated (Step 3 pending)
📈 Active Operations: ${botState.activeOperations.size}

*Current Step:* Step 2 Complete - Ready for wallet testing
*Next Step:* Token launch integration (Step 3)
    `;
    
    bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
});

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
                    ]
                ]
            }
        });
    } catch (error) {
        console.error('❌ Error fetching wallets:', error);
        bot.sendMessage(chatId, '❌ Error fetching wallet information. Please try again.');
    }
});

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
                        ]
                    ]
                }
            });
            
            bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Balances refreshed!' });
        } catch (error) {
            bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Refresh failed' });
        }
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
    }
});

// Placeholder handlers for future steps
bot.onText(/\/launch/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '🚀 Token launch feature coming in Step 3! Wallets are ready to use.');
});

bot.onText(/\/pause/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '⏸️ Pause functionality coming in Step 4! No active operations yet.');
});

bot.onText(/\/rugpull/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '🔴 Rugpull functionality coming in Step 4! No holdings to sell yet.');
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

console.log('🎯 Step 2 Complete: Wallet Integration Ready');
console.log('⏳ Waiting for user confirmation to proceed to Step 3...');