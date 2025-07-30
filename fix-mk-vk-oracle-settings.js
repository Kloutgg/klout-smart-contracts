const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const { 
  AdminClient,
  BulkAccountLoader,
  Wallet
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=35e3349e-26bd-4c88-88f3-a3d99637ae01";
const WALLET_PATH = "../bilc.json"; // Adjust path as needed
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");

// Markets to fix
const MARKETS_TO_FIX = [
    { name: "MK-HS (HS-MK-PERP)", index: 5 },
    { name: "VK-HS (VK-HS-PERP)", index: 6 }
];

async function fixOracleSettings() {
    console.log("🔧 FIXING ORACLE SETTINGS FOR MK-HS & VK-HS");
    console.log("=" .repeat(70));
    console.log();

    try {
        // Load wallet using the same pattern as fix-mno-oracle.js
        const keypair = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
        );
        console.log(`👤 Admin Wallet: ${keypair.publicKey.toString()}`);

        // Create provider and admin client using the working pattern
        const provider = new anchor.AnchorProvider(
            new Connection(DEVNET_RPC, 'confirmed'),
            new Wallet(keypair),
            { commitment: 'confirmed', preflightCommitment: 'confirmed' }
        );
        
        console.log("💰 Balance:", ((await provider.connection.getBalance(keypair.publicKey)) / 1e9).toFixed(2), "SOL");
        
        const adminClient = new AdminClient({
            connection: provider.connection,
            wallet: provider.wallet,
            programID: DRIFT_PROGRAM_ID,
            opts: { 
                commitment: 'confirmed',
                preflightCommitment: 'confirmed'
            },
            activeSubAccountId: 0,
            perpMarketIndexes: [0, 1, 2, 3, 4, 5, 6], // Include all markets
            spotMarketIndexes: [0],
            subAccountIds: [],
            accountSubscription: {
                type: 'polling',
                accountLoader: new BulkAccountLoader(provider.connection, 'confirmed', 1000),
            },
        });

        console.log("\n🔧 Initializing AdminClient...");
        await adminClient.subscribe();
        
        // Wait for state to load (same pattern as working script)
        let retries = 0;
        while (retries < 5) {
            try {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const state = adminClient.getStateAccount();
                if (state && state.admin) {
                    console.log("✅ AdminClient ready");
                    break;
                }
            } catch (error) {
                console.log(`   Loading... retry ${retries + 1}`);
            }
            retries++;
        }
        console.log();

        // Fix each market
        for (const market of MARKETS_TO_FIX) {
            console.log(`🔧 Fixing ${market.name} (Market Index: ${market.index})`);
            console.log("-".repeat(60));

            try {
                // Check current setting
                const perpMarket = adminClient.getPerpMarketAccount(market.index);
                const currentOverride = perpMarket.amm.oracleSlotDelayOverride;
                console.log(`Current Oracle Slot Delay Override: ${currentOverride}`);

                if (currentOverride === -1) {
                    console.log("✅ Already permissive - no change needed");
                    console.log();
                    continue;
                }

                // Try the high-level SDK method first (simpler approach)
                console.log("Applying oracle slot delay override of -1...");
                
                let result;
                try {
                    // Use the high-level AdminClient method directly
                    result = await adminClient.updatePerpMarketOracleSlotDelayOverride(
                        market.index,
                        -1  // -1 disables staleness checks
                    );
                    console.log(`   ✅ High-level method succeeded`);
                } catch (highLevelError) {
                    console.log(`   ⚠️  High-level method failed: ${highLevelError.message}`);
                    console.log(`   🔧 Trying manual instruction building...`);
                    
                    // Fallback to manual instruction building
                    // Get the actual perp market public key from the market account object
                    const marketAccount = adminClient.getPerpMarketAccount(market.index);
                    const perpMarketPublicKey = marketAccount.pubkey;
                    
                    const [statePublicKey] = PublicKey.findProgramAddressSync(
                        [Buffer.from("drift_state")],
                        DRIFT_PROGRAM_ID
                    );
                    
                    const ix = await adminClient.program.methods
                        .updatePerpMarketOracleSlotDelayOverride(-1)
                        .accounts({
                            admin: adminClient.wallet.publicKey,
                            state: statePublicKey,
                            perpMarket: perpMarketPublicKey,
                        })
                        .instruction();
                    
                    // Try using the raw provider instead of AdminClient for transaction building
                    const tx = new Transaction().add(ix);
                    const txSig = await provider.sendAndConfirm(tx);
                    result = { txSig };
                }

                console.log(`✅ Oracle slot delay override applied!`);
                console.log(`📋 Transaction: ${result.txSig}`);
                console.log(`   🔗 View: https://solscan.io/tx/${result.txSig}?cluster=devnet`);
                
                // Wait a moment for the transaction to be confirmed
                await new Promise(resolve => setTimeout(resolve, 3000));

                // Verify the change
                const updatedMarket = adminClient.getPerpMarketAccount(market.index);
                const newOverride = updatedMarket.amm.oracleSlotDelayOverride;
                console.log(`✅ Verified: New Oracle Slot Delay Override: ${newOverride}`);

            } catch (error) {
                console.log(`❌ Error fixing ${market.name}: ${error.message}`);
                if (error.logs) {
                    console.log("Program logs:", error.logs);
                }
            }
            
            console.log();
        }

        console.log("📋 FINAL VERIFICATION:");
        console.log("=" .repeat(70));
        
        // Final check of all markets
        for (const market of MARKETS_TO_FIX) {
            const perpMarket = adminClient.getPerpMarketAccount(market.index);
            const override = perpMarket.amm.oracleSlotDelayOverride;
            const status = override === -1 ? "🟢 PERMISSIVE" : "🔴 RESTRICTED";
            console.log(`${market.name}: ${status} (${override})`);
        }

        await adminClient.unsubscribe();

    } catch (error) {
        console.log("❌ Fatal error:", error.message);
        process.exit(1);
    }
}

// Show usage information
console.log("📋 ORACLE SETTINGS FIXER");
console.log("This script will set oracle slot delay override to -1 for MK-HS and VK-HS markets");
console.log("This disables oracle staleness checks, allowing immediate trading");
console.log();
console.log("⚠️  IMPORTANT: This requires admin privileges");
console.log("Make sure you have the correct admin wallet at:", WALLET_PATH);
console.log();

// Uncomment the line below to actually run the fix
fixOracleSettings().catch(console.error);

console.log("🚨 TO RUN THE FIX: Uncomment the last line in this script");
console.log("🔍 TO JUST CHECK: Run 'node check-mk-vk-oracles.js' instead"); 