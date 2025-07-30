const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey } = require('@solana/web3.js');
const { 
  DriftClient,
  BulkAccountLoader,
  OracleSource,
  initialize
} = require('@drift-labs/sdk');

// Configuration
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=35e3349e-26bd-4c88-88f3-a3d99637ae01";
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");

// Markets to check - can be easily modified
const MARKETS_TO_CHECK = [
    { name: "GHI-PERP", index: 2 },
    { name: "VK-2-DEF", index: 3 },
    { name: "MNO-PERP", index: 4 },
    { name: "MK-HS (HS-MK-PERP)", index: 5 },
    { name: "VK-HS (VK-HS-PERP)", index: 6 }
];

async function checkOracleConfigurations() {
    console.log("🔍 ORACLE CONFIGURATION CHECKER");
    console.log("=" .repeat(80));
    console.log(`📡 RPC: ${DEVNET_RPC}`);
    console.log(`🏦 Drift Program: ${DRIFT_PROGRAM_ID.toString()}`);
    console.log();

    try {
        // Initialize connection and client
        const connection = new Connection(DEVNET_RPC, 'confirmed');
        const sdkConfig = initialize({ env: 'devnet' });
        
        // Create a dummy wallet for read-only operations
        const dummyWallet = {
            publicKey: new PublicKey("11111111111111111111111111111111"),
            signTransaction: async () => { throw new Error("Read-only wallet"); },
            signAllTransactions: async () => { throw new Error("Read-only wallet"); }
        };

        const driftClient = new DriftClient({
            connection,
            wallet: dummyWallet,
            programID: DRIFT_PROGRAM_ID,
            env: 'devnet',
            accountSubscription: {
                type: 'polling',
                accountLoader: new BulkAccountLoader(connection, 'confirmed', 1000)
            }
        });

        await driftClient.subscribe();
        console.log("✅ Connected to Drift client successfully");
        console.log();

        // Check each market
        for (const market of MARKETS_TO_CHECK) {
            await checkMarketOracleConfig(driftClient, market.name, market.index);
        }

        await driftClient.unsubscribe();

    } catch (error) {
        console.error("❌ Error checking oracle configurations:", error);
        process.exit(1);
    }
}

async function checkMarketOracleConfig(driftClient, marketName, marketIndex) {
    console.log(`🎯 CHECKING: ${marketName} (Market Index: ${marketIndex})`);
    console.log("-".repeat(60));

    try {
        // Get perpetual market account
        const perpMarket = driftClient.getPerpMarketAccount(marketIndex);
        
        if (!perpMarket) {
            console.log(`⚠️  Market ${marketIndex} not found or not initialized`);
            console.log();
            return;
        }

        // Extract oracle configuration from AMM
        const amm = perpMarket.amm;
        const oracleSlotDelayOverride = amm.oracleSlotDelayOverride;
        const oracleSource = amm.oracleSource;
        const oracle = amm.oracle;
        const lastOracleValid = amm.lastOracleValid;

        // Display basic market info
        console.log(`📊 Market Name: ${marketName}`);
        console.log(`🔢 Market Index: ${marketIndex}`);
        console.log(`🔮 Oracle Address: ${oracle.toString()}`);
        console.log(`📡 Oracle Source: ${getOracleSourceName(oracleSource)} (${JSON.stringify(oracleSource)})`);
        console.log(`✅ Last Oracle Valid: ${lastOracleValid}`);
        
        // Key oracle configuration
        console.log();
        console.log("🚀 ORACLE CONFIGURATION:");
        console.log(`   📊 Slot Delay Override: ${oracleSlotDelayOverride}`);
        
        // Interpret the slot delay override
        if (oracleSlotDelayOverride === -1) {
            console.log(`   ✅ PERMISSIVE MODE: Staleness checks DISABLED (-1 override)`);
            console.log(`   🎯 This market should allow immediate trading regardless of oracle age`);
        } else if (oracleSlotDelayOverride === 0) {
            console.log(`   ⚠️  STANDARD MODE: Uses default staleness checks (0 = no override)`);
            console.log(`   📋 Subject to normal oracle guard rails`);
        } else {
            console.log(`   ⚙️  CUSTOM MODE: Custom staleness threshold of ${oracleSlotDelayOverride} slots`);
        }

        // Additional AMM settings that might affect trading
        console.log();
        console.log("⚙️  ADDITIONAL AMM SETTINGS:");
        console.log(`   🎯 Base Spread: ${amm.baseSpread}`);
        console.log(`   📊 Max Spread: ${amm.maxSpread}`);
        console.log(`   🔄 Curve Update Intensity: ${amm.curveUpdateIntensity}`);
        console.log(`   ⚡ AMM JIT Intensity: ${amm.ammJitIntensity}`);
        
        if (amm.ammSpreadAdjustment !== 0) {
            console.log(`   📈 Spread Adjustment: ${amm.ammSpreadAdjustment}`);
        }
        
        if (amm.takerSpeedBumpOverride !== 0) {
            console.log(`   🚦 Speed Bump Override: ${amm.takerSpeedBumpOverride}`);
        }

        // Market status summary
        console.log();
        console.log("📋 TRADING STATUS SUMMARY:");
        
        const isPermissive = oracleSlotDelayOverride === -1;
        const hasBaseLiquidity = amm.baseSpread > 0;
        
        if (isPermissive && hasBaseLiquidity) {
            console.log("   🟢 READY FOR IMMEDIATE TRADING");
            console.log("   ✅ Oracle staleness checks disabled");
            console.log("   ✅ AMM liquidity enabled");
        } else if (isPermissive && !hasBaseLiquidity) {
            console.log("   🟡 ORACLE PERMISSIVE BUT NO AMM LIQUIDITY");
            console.log("   ✅ Oracle staleness checks disabled");
            console.log("   ⚠️  AMM base spread is 0 - no AMM trading");
        } else if (!isPermissive && hasBaseLiquidity) {
            console.log("   🟡 AMM READY BUT ORACLE CHECKS ACTIVE");
            console.log("   ⚠️  Subject to oracle staleness validation");
            console.log("   ✅ AMM liquidity enabled");
        } else {
            console.log("   🔴 TRADING LIKELY RESTRICTED");
            console.log("   ⚠️  Oracle staleness checks active");
            console.log("   ⚠️  No AMM base liquidity");
        }

    } catch (error) {
        console.log(`❌ Error checking market ${marketIndex}: ${error.message}`);
    }
    
    console.log();
}

function getOracleSourceName(oracleSource) {
    // Handle both numeric and object formats
    let sourceKey;
    if (typeof oracleSource === 'object' && oracleSource !== null) {
        // Extract the key from the object (likely an enum)
        const keys = Object.keys(oracleSource);
        if (keys.length > 0) {
            sourceKey = keys[0];
        }
    } else {
        sourceKey = oracleSource;
    }
    
    const sourceMap = {
        0: "Pyth",
        1: "Switchboard", 
        2: "QuoteAsset",
        3: "Pyth Pull",
        4: "Pyth Push",
        5: "Pyth 1K",
        6: "Pyth 1M",
        7: "Pyth Stable Coin",
        8: "Prelaunch",
        "prelaunch": "Prelaunch",
        9: "Pyth Lazer",
        10: "Pyth 1K Pull",
        11: "Pyth 1M Pull", 
        12: "Pyth Stable Coin Pull"
    };
    
    return sourceMap[sourceKey] || `Unknown (${sourceKey || JSON.stringify(oracleSource)})`;
}

// Execute the checker
checkOracleConfigurations().catch(console.error); 