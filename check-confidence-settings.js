const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { 
  DriftClient,
  BulkAccountLoader,
  Wallet
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=35e3349e-26bd-4c88-88f3-a3d99637ae01";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");

// Markets to check confidence settings
const MARKETS_TO_CHECK = [
    { name: "MNO-PERP", index: 4 },
    { name: "MK-HS", index: 5 },
    { name: "VK-HS", index: 6 }
];

async function checkConfidenceSettings() {
    console.log("🔍 CONFIDENCE LEVEL SETTINGS CHECKER");
    console.log("=" .repeat(70));
    console.log();

    try {
        const keypair = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
        );

        const provider = new anchor.AnchorProvider(
            new Connection(DEVNET_RPC, 'confirmed'),
            new Wallet(keypair),
            { commitment: 'confirmed' }
        );
        
        const driftClient = new DriftClient({
            connection: provider.connection,
            wallet: {
                publicKey: new PublicKey("11111111111111111111111111111111"),
                signTransaction: async () => { throw new Error("Read-only"); },
                signAllTransactions: async () => { throw new Error("Read-only"); }
            },
            programID: DRIFT_PROGRAM_ID,
            env: 'devnet',
            accountSubscription: {
                type: 'polling',
                accountLoader: new BulkAccountLoader(provider.connection, 'confirmed', 1000)
            }
        });

        await driftClient.subscribe();
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Get global oracle guard rails
        const state = driftClient.getStateAccount();
        const oracleGuardRails = state.oracleGuardRails;
        
        console.log("🌐 GLOBAL ORACLE GUARD RAILS:");
        console.log(`   Confidence Interval Max Size: ${oracleGuardRails.validity.confidenceIntervalMaxSize}`);
        console.log(`   Too Volatile Ratio: ${oracleGuardRails.validity.tooVolatileRatio}`);
        console.log(`   Slots Before Stale (AMM): ${oracleGuardRails.validity.slotsBeforeStaleForAmm}`);
        console.log(`   Slots Before Stale (Margin): ${oracleGuardRails.validity.slotsBeforeStaleForMargin}`);
        console.log();

        // Check each market's confidence settings
        for (const market of MARKETS_TO_CHECK) {
            console.log(`🎯 ${market.name} (Market Index: ${market.index})`);
            console.log("-".repeat(50));

            const perpMarket = driftClient.getPerpMarketAccount(market.index);
            
            // Get contract tier
            const contractTier = perpMarket.contractTier;
            console.log(`   Contract Tier: ${JSON.stringify(contractTier)}`);
            
            // Calculate max confidence multiplier based on contract tier
            let maxConfidenceMultiplier;
            if (contractTier.a !== undefined) {
                maxConfidenceMultiplier = 1; // 2%
            } else if (contractTier.b !== undefined) {
                maxConfidenceMultiplier = 1; // 2%  
            } else if (contractTier.c !== undefined) {
                maxConfidenceMultiplier = 2; // 4%
            } else if (contractTier.speculative !== undefined) {
                maxConfidenceMultiplier = 10; // 20%
            } else if (contractTier.highlySpeculative !== undefined) {
                maxConfidenceMultiplier = 50; // 100%
            } else if (contractTier.isolated !== undefined) {
                maxConfidenceMultiplier = 50; // 100%
            } else {
                maxConfidenceMultiplier = 1; // Default
            }
            
            console.log(`   Max Confidence Multiplier: ${maxConfidenceMultiplier}`);
            
            // Calculate effective confidence limit
            const effectiveConfidenceLimit = oracleGuardRails.validity.confidenceIntervalMaxSize * maxConfidenceMultiplier;
            console.log(`   Effective Confidence Limit: ${effectiveConfidenceLimit} (${effectiveConfidenceLimit / 10000}%)`);
            
            // Oracle settings
            console.log(`   Oracle Slot Delay Override: ${perpMarket.amm.oracleSlotDelayOverride}`);
            console.log(`   Oracle Source: ${JSON.stringify(perpMarket.amm.oracleSource)}`);
            
            // Status
            const isPermissiveStale = perpMarket.amm.oracleSlotDelayOverride === -1;
            const isPermissiveConfidence = maxConfidenceMultiplier >= 50; // 100% confidence allowed
            
            console.log();
            console.log("   📋 VALIDATION STATUS:");
            console.log(`   Staleness Checks: ${isPermissiveStale ? '🟢 DISABLED' : '🔴 ACTIVE'}`);
            console.log(`   Confidence Checks: ${isPermissiveConfidence ? '🟢 VERY PERMISSIVE (100%)' : '🟡 ACTIVE (' + (effectiveConfidenceLimit/10000) + '%)'}`);
            
            if (isPermissiveStale && isPermissiveConfidence) {
                console.log(`   Overall Status: 🟢 FULLY PERMISSIVE`);
            } else if (isPermissiveStale) {
                console.log(`   Overall Status: 🟡 STALE-PERMISSIVE ONLY`);
            } else {
                console.log(`   Overall Status: 🔴 RESTRICTIVE`);
            }
            
            console.log();
        }

        // Summary
        console.log("📋 CONFIDENCE CHECK SUMMARY:");
        console.log("=" .repeat(70));
        console.log("Oracle validation has two main checks:");
        console.log("1. 🕐 Staleness checks (controlled by oracleSlotDelayOverride)");
        console.log("2. 📊 Confidence checks (controlled by contract tier + global limits)");
        console.log();
        console.log("Current status:");
        
        for (const market of MARKETS_TO_CHECK) {
            const perpMarket = driftClient.getPerpMarketAccount(market.index);
            const isStalePermissive = perpMarket.amm.oracleSlotDelayOverride === -1;
            
            let maxConfidenceMultiplier = 1;
            if (perpMarket.contractTier.highlySpeculative !== undefined || 
                perpMarket.contractTier.isolated !== undefined) {
                maxConfidenceMultiplier = 50;
            } else if (perpMarket.contractTier.speculative !== undefined) {
                maxConfidenceMultiplier = 10;
            }
            
            const isConfidencePermissive = maxConfidenceMultiplier >= 50;
            
            console.log(`${market.name}: Stale=${isStalePermissive ? '✅' : '❌'} Confidence=${isConfidencePermissive ? '✅' : '❌'}`);
        }

        await driftClient.unsubscribe();

    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

checkConfidenceSettings().catch(console.error); 