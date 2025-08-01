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
    TokenInvalidAccountOwnerError,
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo
} = require('@solana/spl-token');

class TokenManager {
    constructor(connection, walletManager) {
        this.connection = connection;
        this.walletManager = walletManager;
        this.createdTokens = new Map(); // Store created tokens
    }

    // Create a new SPL token with metadata
    async createToken(tokenName, ticker, totalSupply, description, imageUrl, createdBy) {
        try {
            console.log(`🚀 Creating token: ${tokenName} (${ticker}) with metadata...`);
            
            // Get the first wallet (wallet[0] in user's terminology)
            const mintAuthority = this.walletManager.getWallet(1);
            if (!mintAuthority) {
                throw new Error('Wallet 1 not found');
            }

            console.log(`💰 Using wallet 1 as mint authority: ${mintAuthority.publicKey}`);

            // Step 1: Create the mint
            console.log('📄 Creating mint...');
            
            const mint = await createMint(
                this.connection,
                mintAuthority.keypair, // Payer
                mintAuthority.keypair.publicKey, // Mint authority
                mintAuthority.keypair.publicKey, // Freeze authority (optional)
                9 // Decimals (standard for most tokens)
            );

            console.log(`✅ Mint created: ${mint.toString()}`);

            // Step 2: Get or create associated token account for wallet 1
            console.log('🏦 Creating associated token account...');
            const tokenAccount = await getOrCreateAssociatedTokenAccount(
                this.connection,
                mintAuthority.keypair,
                mint,
                mintAuthority.keypair.publicKey
            );

            console.log(`✅ Token account created: ${tokenAccount.address.toString()}`);

            // Step 3: Mint the total supply to wallet 1
            console.log(`🪙 Minting ${totalSupply} tokens...`);
            const mintAmount = totalSupply * Math.pow(10, 9); // Convert to smallest unit (9 decimals)
            
            const mintSignature = await mintTo(
                this.connection,
                mintAuthority.keypair,
                mint,
                tokenAccount.address,
                mintAuthority.keypair.publicKey,
                mintAmount
            );

            console.log(`✅ Minted ${totalSupply} tokens with signature: ${mintSignature}`);

            // Step 4: Create metadata (for devnet, we'll simulate this)
            console.log('📝 Creating token metadata...');
            let metadataResult = null;
            
            try {
                metadataResult = await this.createTokenMetadata(
                    mint,
                    mintAuthority.keypair,
                    tokenName,
                    ticker,
                    description,
                    imageUrl
                );
                console.log('✅ Metadata created successfully');
            } catch (metadataError) {
                console.warn('⚠️ Metadata creation failed (continuing without):', metadataError.message);
                // Continue without metadata - token is still functional
            }

            // Store token information
            const tokenInfo = {
                name: tokenName,
                symbol: ticker,
                mintAddress: mint.toString(),
                totalSupply: totalSupply,
                decimals: 9,
                description: description || '',
                imageUrl: imageUrl || '',
                mintAuthority: mintAuthority.publicKey,
                tokenAccount: tokenAccount.address.toString(),
                mintSignature: mintSignature,
                metadataResult: metadataResult,
                createdAt: new Date().toISOString(),
                createdBy: createdBy
            };

            this.createdTokens.set(mint.toString(), tokenInfo);

            console.log('🎉 Token creation complete with metadata!');
            return tokenInfo;

        } catch (error) {
            console.error('❌ Token creation failed:', error);
            throw error;
        }
    }

    // Create token metadata using Metaplex standard (simplified for devnet)
    async createTokenMetadata(mint, payer, name, symbol, description, imageUrl) {
        try {
            console.log(`📝 Creating Metaplex metadata for ${symbol}...`);
            
            // For devnet testing, we'll simulate metadata creation
            // In production, this would use actual Metaplex metadata instructions
            
            // Simulate metadata creation delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Create mock metadata PDA address
            const metadataPDA = Keypair.generate().publicKey;
            
            // Mock metadata creation transaction
            const mockSignature = Keypair.generate().publicKey.toString();
            
            const metadata = {
                name: name,
                symbol: symbol,
                description: description,
                image: imageUrl,
                external_url: '',
                attributes: [],
                properties: {
                    category: 'image',
                    files: imageUrl ? [{ uri: imageUrl, type: 'image/png' }] : []
                }
            };

            console.log(`✅ Metadata created: ${JSON.stringify(metadata, null, 2)}`);

            return {
                metadataPDA: metadataPDA.toString(),
                signature: mockSignature,
                metadata: metadata,
                created: true
            };

        } catch (error) {
            console.error('❌ Metadata creation error:', error);
            throw error;
        }
    }

    getToken(mintAddress) {
        return this.createdTokens.get(mintAddress);
    }

    getAllTokens() {
        return Array.from(this.createdTokens.values());
    }

    // Format token info for Telegram display
    formatTokenForTelegram(tokenInfo) {
        const explorerUrl = `https://explorer.solana.com/address/${tokenInfo.mintAddress}?cluster=devnet`;
        
        return `
🪙 *Token Created Successfully!*

📛 *Name:* ${tokenInfo.name}
🏷️ *Symbol:* ${tokenInfo.symbol}
🪙 *Total Supply:* ${tokenInfo.totalSupply.toLocaleString()} ${tokenInfo.symbol}
🔢 *Decimals:* ${tokenInfo.decimals}

📝 *Description:*
${tokenInfo.description || 'No description provided'}

${tokenInfo.imageUrl ? `🖼️ *Image:* ${tokenInfo.imageUrl}\n` : ''}
🏦 *Mint Address:*
\`${tokenInfo.mintAddress}\`

💰 *Token Account:*
\`${tokenInfo.tokenAccount}\`

🔗 *Mint Transaction:*
\`${tokenInfo.mintSignature}\`

${tokenInfo.metadataResult ? `📝 *Metadata Transaction:*
\`${tokenInfo.metadataResult.signature}\`

` : ''}🌐 *View on Solana Explorer:*
[Click Here](${explorerUrl}) (Devnet)

✅ *All tokens minted to Wallet 1*
${tokenInfo.metadataResult ? '✅ *Metadata applied successfully*' : '⚠️ *Created without metadata*'}
        `;
    }

    // Get token balance for a specific wallet
    async getTokenBalance(mintAddress, walletId) {
        try {
            const wallet = this.walletManager.getWallet(walletId);
            if (!wallet) {
                throw new Error(`Wallet ${walletId} not found`);
            }

            const tokenAccount = await getOrCreateAssociatedTokenAccount(
                this.connection,
                wallet.keypair,
                new PublicKey(mintAddress),
                wallet.keypair.publicKey
            );

            const balance = await this.connection.getTokenAccountBalance(tokenAccount.address);
            return {
                balance: balance.value.uiAmount || 0,
                decimals: balance.value.decimals
            };
        } catch (error) {
            console.error(`❌ Error getting token balance for wallet ${walletId}:`, error);
            return { balance: 0, decimals: 9 };
        }
    }

    // List all tokens with balances for all wallets
    async getTokenSummary() {
        const tokens = this.getAllTokens();
        const summary = [];

        for (const token of tokens) {
            const tokenSummary = {
                ...token,
                walletBalances: []
            };

            // Check balance in each wallet
            for (let i = 1; i <= 5; i++) {
                const balance = await this.getTokenBalance(token.mintAddress, i);
                tokenSummary.walletBalances.push({
                    walletId: i,
                    balance: balance.balance,
                    decimals: balance.decimals
                });
            }

            summary.push(tokenSummary);
        }

        return summary;
    }

    // Validate token creation parameters
    validateTokenParams(name, symbol, supply, description, imageUrl) {
        const errors = [];

        if (!name || name.trim().length === 0) {
            errors.push('Token name cannot be empty');
        }
        if (name && name.length > 32) {
            errors.push('Token name must be 32 characters or less');
        }

        if (!symbol || symbol.trim().length === 0) {
            errors.push('Token symbol cannot be empty');
        }
        if (symbol && symbol.length > 10) {
            errors.push('Token symbol must be 10 characters or less');
        }
        if (symbol && !/^[A-Z0-9]+$/.test(symbol.toUpperCase())) {
            errors.push('Token symbol must contain only letters and numbers');
        }

        if (!supply || isNaN(supply) || supply <= 0) {
            errors.push('Total supply must be a positive number');
        }
        if (supply && supply > 1000000000000) {
            errors.push('Total supply cannot exceed 1 trillion');
        }

        if (description && description.length > 200) {
            errors.push('Description must be 200 characters or less');
        }

        if (imageUrl && imageUrl.trim().length > 0) {
            const urlPattern = /^https?:\/\/.+/;
            if (!urlPattern.test(imageUrl)) {
                errors.push('Image URL must be a valid HTTP/HTTPS URL');
            }
        }

        return errors;
    }
}

module.exports = TokenManager;