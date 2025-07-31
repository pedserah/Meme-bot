const { Keypair, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');

class WalletManager {
    constructor(connection) {
        this.connection = connection;
        this.wallets = [];
        this.initializeWallets();
    }

    initializeWallets() {
        const mnemonics = [
            process.env.WALLET_1_MNEMONIC,
            process.env.WALLET_2_MNEMONIC,
            process.env.WALLET_3_MNEMONIC,
            process.env.WALLET_4_MNEMONIC,
            process.env.WALLET_5_MNEMONIC
        ];

        const derivationPath = process.env.DERIVATION_PATH || "m/44'/501'/0'/0'";

        this.wallets = mnemonics.map((mnemonic, index) => {
            try {
                // Generate seed from mnemonic
                const seed = bip39.mnemonicToSeedSync(mnemonic);
                
                // Derive keypair using the specified path
                const derivedSeed = derivePath(derivationPath, seed.toString('hex')).key;
                
                // Create Solana keypair from derived seed
                const keypair = Keypair.fromSeed(derivedSeed);
                
                return {
                    id: index + 1,
                    keypair: keypair,
                    publicKey: keypair.publicKey.toString(),
                    mnemonic: mnemonic,
                    balance: 0
                };
            } catch (error) {
                console.error(`❌ Error initializing wallet ${index + 1}:`, error.message);
                return null;
            }
        }).filter(wallet => wallet !== null);

        console.log(`✅ Initialized ${this.wallets.length}/5 wallets`);
        this.wallets.forEach(wallet => {
            console.log(`💰 Wallet ${wallet.id}: ${wallet.publicKey}`);
        });
    }

    async updateBalances() {
        const balancePromises = this.wallets.map(async (wallet) => {
            try {
                const balance = await this.connection.getBalance(wallet.keypair.publicKey);
                wallet.balance = balance / LAMPORTS_PER_SOL;
                return wallet;
            } catch (error) {
                console.error(`❌ Error fetching balance for wallet ${wallet.id}:`, error.message);
                wallet.balance = 0;
                return wallet;
            }
        });

        await Promise.all(balancePromises);
        return this.wallets;
    }

    getWallet(id) {
        return this.wallets.find(wallet => wallet.id === id);
    }

    getAllWallets() {
        return this.wallets;
    }

    async getWalletSummary() {
        await this.updateBalances();
        
        const summary = {
            totalWallets: this.wallets.length,
            totalBalance: this.wallets.reduce((sum, wallet) => sum + wallet.balance, 0),
            wallets: this.wallets.map(wallet => ({
                id: wallet.id,
                publicKey: wallet.publicKey,
                balance: wallet.balance,
                balanceFormatted: `${wallet.balance.toFixed(4)} SOL`
            }))
        };

        return summary;
    }

    // Utility function to format wallet info for Telegram messages
    formatWalletForTelegram(wallet) {
        const shortKey = `${wallet.publicKey.slice(0, 8)}...${wallet.publicKey.slice(-8)}`;
        return `💰 Wallet ${wallet.id}: \`${shortKey}\`\n   Balance: *${wallet.balance.toFixed(4)} SOL*`;
    }

    async formatAllWalletsForTelegram() {
        await this.updateBalances();
        
        const totalBalance = this.wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
        
        let message = `💼 *Wallet Status* (${this.wallets.length}/5 active)\n\n`;
        
        this.wallets.forEach(wallet => {
            message += this.formatWalletForTelegram(wallet) + '\n\n';
        });
        
        message += `📊 *Total Balance: ${totalBalance.toFixed(4)} SOL*\n`;
        message += `🌐 Network: ${process.env.SOLANA_NETWORK || 'devnet'}`;
        
        return message;
    }

    // Request devnet SOL airdrop for testing
    async requestAirdrop(walletId, amount = 1) {
        const wallet = this.getWallet(walletId);
        if (!wallet) {
            throw new Error(`Wallet ${walletId} not found`);
        }

        try {
            console.log(`🪂 Requesting ${amount} SOL airdrop for wallet ${walletId}...`);
            const signature = await this.connection.requestAirdrop(
                wallet.keypair.publicKey,
                amount * LAMPORTS_PER_SOL
            );
            
            // Wait for confirmation
            await this.connection.confirmTransaction(signature);
            
            // Update balance
            await this.updateBalances();
            
            return {
                success: true,
                signature,
                newBalance: wallet.balance
            };
        } catch (error) {
            console.error(`❌ Airdrop failed for wallet ${walletId}:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = WalletManager;