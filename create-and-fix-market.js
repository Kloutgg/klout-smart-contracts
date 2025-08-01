const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const { 
  BN, 
  TestClient,
  AdminClient,
  BulkAccountLoader,
  OracleSource,
  BASE_PRECISION,
  PRICE_PRECISION,
  PEG_PRECISION,
  Wallet,
  getPrelaunchOraclePublicKey,
  ContractTier
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration - UPDATE THIS SECTION FOR NEW MARKETS
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=35e3349e-26bd-4c88-88f3-a3d99637ae01";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");

// Function to automatically find the next available market index
async function findNextAvailableMarketIndex(driftClient, provider, startFromIndex = 16) {
  console.log(`\n🔍 AUTO-DISCOVERING NEXT AVAILABLE MARKET INDEX...`);
  console.log(`   Starting search from index: ${startFromIndex}`);
  
  for (let i = startFromIndex; i < 100; i++) { // Check up to index 99
    let marketExists = false;
    let oracleExists = false;
    
    // Check if market exists
    try {
      const market = driftClient.getPerpMarketAccount(i);
      if (market) {
        marketExists = true;
      }
    } catch (e) {
      // Market doesn't exist - good
    }
    
    // Check if oracle exists at this index
    try {
      const prelaunchOracle = getPrelaunchOraclePublicKey(DRIFT_PROGRAM_ID, i);
      const oracleAccount = await provider.connection.getAccountInfo(prelaunchOracle);
      if (oracleAccount) {
        oracleExists = true;
      }
    } catch (e) {
      // Oracle doesn't exist - good
    }
    
    if (!marketExists && !oracleExists) {
      console.log(`✅ Found available market index: ${i}`);
      console.log(`   Market: Available ✓`);
      console.log(`   Oracle: Available ✓`);
      return i;
    } else {
      console.log(`   Index ${i}: ${marketExists ? 'Market exists' : 'Market free'}, ${oracleExists ? 'Oracle exists' : 'Oracle free'}`);
    }
  }
  
  throw new Error('No available market index found in range 16-99');
}

// 🎯 MARKET CONFIGURATION - UPDATE THESE VALUES FOR NEW MARKETS
const MARKET_CONFIG = {
  symbol: 'MK1-1AUG',       // UPDATE: Market symbol (e.g., 'BTC-HS', 'ETH-PERP')
  marketIndex: null,         // AUTO-DISCOVERED: Will be set automatically to next available index
  startPrice: 1000,          // UPDATE: Starting price in USD
  maxPrice: 1000000,         // UPDATE: Maximum price ceiling ($1M)
};

// ✨ CRITICAL AMM CONFIGURATION FOR FULL LIQUIDITY
const AMM_CONFIG = {
  baseSpread: 2500,           // 25 basis points (0.25%) - ENABLES FULL AMM LIQUIDITY
  maxSpread: 142500,          // 1425 basis points (14.25%) - Maximum spread cap
  curveUpdateIntensity: 100,  // Full intensity for spread calculations
  marginRatioInitial: 2000,   // 20% initial margin
  marginRatioMaintenance: 500, // 5% maintenance margin
};

async function createAndFixMarket() {
  console.log("🚀 CREATING & CONFIGURING HIGHLY SPECULATIVE MARKET");
  console.log("=" .repeat(70));
  console.log(`Market: ${MARKET_CONFIG.symbol}`);
  console.log(`Starting Price: $${MARKET_CONFIG.startPrice}`);
  console.log(`Max Price: $${MARKET_CONFIG.maxPrice}`);
  console.log(`Market Index: AUTO-DISCOVERED (will be determined automatically)`);
  console.log(`\n🔧 AMM Configuration:`);
  console.log(`   Base Spread: ${AMM_CONFIG.baseSpread} (${AMM_CONFIG.baseSpread/100} bps = ${AMM_CONFIG.baseSpread/10000}%)`);
  console.log(`   Max Spread: ${AMM_CONFIG.maxSpread} (${AMM_CONFIG.maxSpread/100} bps = ${AMM_CONFIG.maxSpread/10000}%)`);
  console.log(`   Curve Update Intensity: ${AMM_CONFIG.curveUpdateIntensity}%\n`);
  
  // Load wallet
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  console.log("📝 Wallet:", keypair.publicKey.toBase58());

  const provider = new anchor.AnchorProvider(
    new Connection(DEVNET_RPC, 'confirmed'),
    new Wallet(keypair),
    { commitment: 'confirmed', preflightCommitment: 'confirmed' }
  );
  
  console.log("💰 Balance:", ((await provider.connection.getBalance(keypair.publicKey)) / 1e9).toFixed(2), "SOL");

  // STEP 1: AUTO-DISCOVER NEXT AVAILABLE MARKET INDEX
  // Create temporary client to check existing markets
  const tempDriftClient = new TestClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [], // No specific markets for discovery
    spotMarketIndexes: [0],
    accountSubscription: {
      type: 'polling',
      accountLoader: new BulkAccountLoader(provider.connection, 'confirmed', 0),
    },
  });

  await tempDriftClient.subscribe();
  await tempDriftClient.fetchAccounts();
  
  // Auto-discover the next available market index
  MARKET_CONFIG.marketIndex = await findNextAvailableMarketIndex(tempDriftClient, provider);
  
  await tempDriftClient.unsubscribe();
  
  console.log(`\n🎯 FINAL MARKET CONFIGURATION:`);
  console.log(`   Market: ${MARKET_CONFIG.symbol}`);
  console.log(`   Auto-Discovered Index: ${MARKET_CONFIG.marketIndex} ✅`);
  console.log(`   Starting Price: $${MARKET_CONFIG.startPrice}`);
  console.log(`   Max Price: $${MARKET_CONFIG.maxPrice}`);
  
  // Calculate prices in Drift precision
  const startPrice = PRICE_PRECISION.mul(new BN(MARKET_CONFIG.startPrice));
  const maxPrice = PRICE_PRECISION.mul(new BN(MARKET_CONFIG.maxPrice));
  
  console.log(`\n🔧 Price Calculations:`);
  console.log(`  Start Price: ${startPrice.toString()} (${MARKET_CONFIG.startPrice} * PRICE_PRECISION)`);
  console.log(`  Max Price: ${maxPrice.toString()} (${MARKET_CONFIG.maxPrice} * PRICE_PRECISION)`);

  // Derive prelaunch oracle public key using discovered market index
  const prelaunchOracle = getPrelaunchOraclePublicKey(DRIFT_PROGRAM_ID, MARKET_CONFIG.marketIndex);
  console.log(`\n🔮 Prelaunch Oracle:`);
  console.log(`  Address: ${prelaunchOracle.toBase58()}`);
  console.log(`  Market Index: ${MARKET_CONFIG.marketIndex}`);

  // PHASE 1: CREATE MARKET USING TestClient
  console.log("\n" + "=".repeat(70));
  console.log("🏗️  PHASE 1: CREATING MARKET");
  console.log("=" .repeat(70));

  const driftClient = new TestClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [MARKET_CONFIG.marketIndex],
    spotMarketIndexes: [0],
    oracleInfos: [
      { publicKey: prelaunchOracle, source: OracleSource.Prelaunch }
    ],
    accountSubscription: {
      type: 'polling',
      accountLoader: new BulkAccountLoader(provider.connection, 'confirmed', 0),
    },
  });

  try {
    await driftClient.subscribe();
    await driftClient.fetchAccounts();
    
    const state = driftClient.getStateAccount();
    console.log(`Current state: ${state.numberOfMarkets} perp markets, ${state.numberOfSpotMarkets} spot markets`);
    
    // Pre-flight checks - show existing markets
    console.log(`\n🔍 PRE-FLIGHT CHECKS:`);
    console.log(`Checking for existing markets and oracles...`);
    
    // Check what markets currently exist
    console.log(`\n📊 Existing Markets:`);
    for (let i = 0; i < 20; i++) {
      try {
        const market = driftClient.getPerpMarketAccount(i);
        if (market) {
          console.log(`   Market ${i}: EXISTS (Oracle: ${market.amm.oracle.toBase58().slice(0,8)}...)`);
        }
      } catch (e) {
        console.log(`   Market ${i}: AVAILABLE`);
      }
    }
    
    // Check if our target market index is available
    try {
      const existingMarket = driftClient.getPerpMarketAccount(MARKET_CONFIG.marketIndex);
      if (existingMarket) {
        console.log(`\n⚠️  WARNING: Market index ${MARKET_CONFIG.marketIndex} is already in use!`);
        console.log(`   Consider using a different marketIndex value.`);
        console.log(`   Current oracle at this index: ${existingMarket.amm.oracle.toBase58()}`);
      } else {
        console.log(`\n✅ Market index ${MARKET_CONFIG.marketIndex} is available`);
      }
    } catch (e) {
      console.log(`\n✅ Market index ${MARKET_CONFIG.marketIndex} is available`);
    }
    
    // Check if oracle exists at this index
    const oracleAccount = await provider.connection.getAccountInfo(prelaunchOracle);
    if (oracleAccount) {
      console.log(`⚠️  Oracle already exists at: ${prelaunchOracle.toBase58()}`);
    } else {
      console.log(`✅ Oracle address is available: ${prelaunchOracle.toBase58()}`);
    }

    // Step 1: Initialize Prelaunch Oracle
    console.log(`\n🔮 Step 1: Initializing Prelaunch Oracle for ${MARKET_CONFIG.symbol}`);
    
    // First, check if oracle already exists
    try {
      const oracleAccount = await provider.connection.getAccountInfo(prelaunchOracle);
      if (oracleAccount) {
        console.log(`✅ Prelaunch Oracle already exists`);
        console.log(`   Oracle Address: ${prelaunchOracle.toBase58()}`);
      } else {
        console.log(`🔄 Oracle doesn't exist, creating new one...`);
        
        try {
          const oracleTxSig = await driftClient.initializePrelaunchOracle(
            MARKET_CONFIG.marketIndex,
            startPrice,
            maxPrice
          );
          
          console.log(`✅ Prelaunch Oracle Initialized!`);
          console.log(`   TX: ${oracleTxSig}`);
          console.log(`   🔗 View: https://solscan.io/tx/${oracleTxSig}?cluster=devnet`);
          
        } catch (oracleError) {
          console.log(`❌ Oracle initialization failed: ${oracleError.message}`);
          console.log(`🔍 Error details:`, oracleError);
          
          // Check if it's a common error
          if (oracleError.message.includes('0x0') || oracleError.message.includes('custom program error')) {
            console.log(`🔧 This might be because:`);
            console.log(`   - Oracle already exists (try different marketIndex)`);
            console.log(`   - Insufficient SOL balance`);
            console.log(`   - Market index already in use`);
            console.log(`   - Admin permissions issue`);
            
            // Try to check if there's already a market at this index
            try {
              const existingMarket = driftClient.getPerpMarketAccount(MARKET_CONFIG.marketIndex);
              if (existingMarket) {
                console.log(`⚠️  Market already exists at index ${MARKET_CONFIG.marketIndex}!`);
                console.log(`   Try using a different marketIndex value`);
              }
            } catch (marketCheckError) {
              console.log(`   Market check failed: ${marketCheckError.message}`);
            }
          }
          throw oracleError;
        }
      }
    } catch (accountCheckError) {
      console.log(`❌ Failed to check oracle account: ${accountCheckError.message}`);
      throw accountCheckError;
    }

    // Step 2: Create Perpetual Market with FULL AMM CONFIGURATION
    console.log(`\n🏪 Step 2: Creating ${MARKET_CONFIG.symbol} Perpetual Market with Full AMM Liquidity`);
    
    // Large equal reserves for substantial liquidity
    const ammInitialQuoteAssetAmount = new BN(10000).mul(BASE_PRECISION);
    const ammInitialBaseAssetAmount = new BN(10000).mul(BASE_PRECISION);
    const periodicity = new BN(3600); // 1 hour
    const pegMultiplier = PEG_PRECISION.mul(new BN(MARKET_CONFIG.startPrice));
    
    console.log(`AMM Configuration:`);
    console.log(`  Equal reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    console.log(`  Base Reserve: ${ammInitialBaseAssetAmount.toString()}`);
    console.log(`  Quote Reserve: ${ammInitialQuoteAssetAmount.toString()}`);
    console.log(`  Oracle source: PRELAUNCH`);
    console.log(`  Peg multiplier: ${pegMultiplier.toString()} ($${MARKET_CONFIG.startPrice})`);
    console.log(`  🎯 Base Spread: ${AMM_CONFIG.baseSpread} (${AMM_CONFIG.baseSpread/10000}% - ENABLES FULL LIQUIDITY)`);
    
    try {
      const marketTxSig = await driftClient.initializePerpMarket(
        MARKET_CONFIG.marketIndex,           // marketIndex
        prelaunchOracle,                     // priceOracle - Our prelaunch oracle
        ammInitialBaseAssetAmount,           // baseAssetReserve
        ammInitialQuoteAssetAmount,          // quoteAssetReserve  
        periodicity,                         // periodicity
        pegMultiplier,                       // pegMultiplier
        OracleSource.Prelaunch,              // oracleSource - Critical: Use prelaunch oracle source
        ContractTier.HIGHLY_SPECULATIVE,     // contractTier
        AMM_CONFIG.marginRatioInitial,       // marginRatioInitial (2000 = 20%)
        AMM_CONFIG.marginRatioMaintenance,   // marginRatioMaintenance (500 = 5%)
        0,                                   // liquidatorFee
        10000,                               // ifLiquidatorFee  
        0,                                   // imfFactor
        true,                                // activeStatus
        AMM_CONFIG.baseSpread,               // ✨ baseSpread (2500 = 0.25% - CRITICAL FOR LIQUIDITY)
        AMM_CONFIG.maxSpread,                // maxSpread (142500 = 14.25%)
        new BN(0),                          // maxOpenInterest (0 = unlimited)
        new BN(0),                          // maxRevenueWithdrawPerPeriod
        new BN(0)                           // contractType (0 = perpetual)
      );

      console.log(`✅ ${MARKET_CONFIG.symbol} MARKET CREATED WITH FULL AMM LIQUIDITY!`);
      console.log(`   TX: ${marketTxSig}`);
      console.log(`   🔗 View: https://solscan.io/tx/${marketTxSig}?cluster=devnet`);
      
      // Step 3: Set Curve Update Intensity for Dynamic Spread Calculation
      console.log(`\n⚙️ Step 3: Configuring AMM Parameters for Optimal Trading`);
      
      try {
        const curveIntensityTx = await driftClient.updatePerpMarketCurveUpdateIntensity(
          MARKET_CONFIG.marketIndex, 
          AMM_CONFIG.curveUpdateIntensity
        );
        console.log(`✅ Curve Update Intensity set to ${AMM_CONFIG.curveUpdateIntensity}%`);
        console.log(`   TX: ${curveIntensityTx}`);
      } catch (curveError) {
        console.log(`⚠️ Curve intensity update failed (non-critical): ${curveError.message}`);
      }
      
    } catch (marketError) {
      if (marketError.message.includes('already initialized') || 
          marketError.message.includes('already exists')) {
        console.log(`✅ ${MARKET_CONFIG.symbol} market already exists!`);
      } else {
        console.log(`❌ Market creation failed: ${marketError.message}`);
        throw marketError;
      }
    }

    await driftClient.unsubscribe();

    // PHASE 2: FIX ORACLE SETTINGS USING AdminClient
    console.log("\n" + "=".repeat(70));
    console.log("🔧 PHASE 2: FIXING ORACLE SETTINGS");
    console.log("=" .repeat(70));

    const adminClient = new AdminClient({
      connection: provider.connection,
      wallet: provider.wallet,
      programID: DRIFT_PROGRAM_ID,
      opts: { 
        commitment: 'confirmed',
        preflightCommitment: 'confirmed'
      },
      activeSubAccountId: 0,
      perpMarketIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, MARKET_CONFIG.marketIndex], // Include the new market index
      spotMarketIndexes: [0],
      subAccountIds: [],
      accountSubscription: {
        type: 'polling',
        accountLoader: new BulkAccountLoader(provider.connection, 'confirmed', 1000),
      },
    });

    console.log("\n🔧 Initializing AdminClient for oracle settings...");
    await adminClient.subscribe();
    
    // Wait for state to load and fetch accounts
    let retries = 0;
    while (retries < 5) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await adminClient.fetchAccounts();
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

    // Fix oracle settings for the newly created market
    console.log(`\n🔧 Fixing Oracle Settings for ${MARKET_CONFIG.symbol} (Market Index: ${MARKET_CONFIG.marketIndex})`);
    console.log("-".repeat(60));
    
    // Debug: Check what markets AdminClient can see
    console.log("\n🔍 AdminClient Market Discovery:");
    for (let i = 0; i <= 16; i++) {
      try {
        const market = adminClient.getPerpMarketAccount(i);
        if (market) {
          console.log(`   ✅ Market ${i}: Found (Oracle: ${market.amm.oracle.toBase58().slice(0,8)}...)`);
        }
      } catch (e) {
        console.log(`   ❌ Market ${i}: Not accessible`);
      }
    }
    
    // Check the newly created market specifically
    try {
      const newMarket = adminClient.getPerpMarketAccount(MARKET_CONFIG.marketIndex);
      if (newMarket) {
        console.log(`   ✅ Market ${MARKET_CONFIG.marketIndex}: Found (Oracle: ${newMarket.amm.oracle.toBase58().slice(0,8)}...)`);
      }
    } catch (e) {
      console.log(`   ❌ Market ${MARKET_CONFIG.marketIndex}: Not accessible - ${e.message}`);
    }

    try {
      // Check current setting
      const perpMarket = adminClient.getPerpMarketAccount(MARKET_CONFIG.marketIndex);
      if (!perpMarket) {
        throw new Error(`Market at index ${MARKET_CONFIG.marketIndex} not found. AdminClient may not be subscribed to this market index.`);
      }
      if (!perpMarket.amm) {
        throw new Error(`AMM data not found for market at index ${MARKET_CONFIG.marketIndex}`);
      }
      const currentOverride = perpMarket.amm.oracleSlotDelayOverride;
      console.log(`Current Oracle Slot Delay Override: ${currentOverride}`);

      if (currentOverride === -1) {
        console.log("✅ Already permissive - no change needed");
      } else {
        // Apply oracle slot delay override of -1 to disable staleness checks
        console.log("Applying oracle slot delay override of -1 to disable staleness checks...");
        
        let result;
        try {
          // Use the high-level AdminClient method directly
          result = await adminClient.updatePerpMarketOracleSlotDelayOverride(
            MARKET_CONFIG.marketIndex,
            -1  // -1 disables staleness checks
          );
          console.log(`   ✅ High-level method succeeded`);
        } catch (highLevelError) {
          console.log(`   ⚠️  High-level method failed: ${highLevelError.message}`);
          console.log(`   🔧 Trying manual instruction building...`);
          
          // Fallback to manual instruction building
          const marketAccount = adminClient.getPerpMarketAccount(MARKET_CONFIG.marketIndex);
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
          
          const tx = new Transaction().add(ix);
          const txSig = await provider.sendAndConfirm(tx);
          result = { txSig };
        }

        console.log(`✅ Oracle slot delay override applied!`);
        console.log(`📋 Transaction: ${result.txSig}`);
        console.log(`   🔗 View: https://solscan.io/tx/${result.txSig}?cluster=devnet`);
        
        // Wait a moment for the transaction to be confirmed
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Verify the final market state
      console.log(`\n🔍 FINAL MARKET VERIFICATION:`);
      console.log("=" .repeat(50));
      
      await adminClient.fetchAccounts();
      const finalMarket = adminClient.getPerpMarketAccount(MARKET_CONFIG.marketIndex);
      
      if (finalMarket && finalMarket.amm) {
        console.log(`✅ Market: ${MARKET_CONFIG.symbol}`);
        console.log(`   Market Index: ${MARKET_CONFIG.marketIndex}`);
        console.log(`   Oracle: ${finalMarket.amm.oracle.toBase58()}`);
        console.log(`   Oracle Source: ${JSON.stringify(finalMarket.amm.oracleSource)}`);
        console.log(`   Oracle Slot Delay Override: ${finalMarket.amm.oracleSlotDelayOverride} ${finalMarket.amm.oracleSlotDelayOverride === -1 ? '🟢 PERMISSIVE' : '🔴 RESTRICTED'}`);
        console.log(`   Base Spread: ${finalMarket.amm.baseSpread} (${finalMarket.amm.baseSpread/10000}%)`);
        console.log(`   Max Spread: ${finalMarket.amm.maxSpread} (${finalMarket.amm.maxSpread/10000}%)`);
        console.log(`   Contract Tier: HIGHLY_SPECULATIVE`);
        
        console.log(`\n🎉 SUCCESS! ${MARKET_CONFIG.symbol} IS FULLY OPERATIONAL!`);
        console.log(`✅ Market created with full AMM liquidity`);
        console.log(`✅ Oracle staleness checks disabled`);
        console.log(`✅ Ready for immediate trading`);
        console.log(`\n🚀 Your highly speculative perpetual futures market is ready!`);
        
      } else {
        console.log(`❌ Final market verification failed`);
      }

    } catch (error) {
      console.log(`❌ Error fixing oracle settings: ${error.message}`);
      if (error.logs) {
        console.log("Program logs:", error.logs);
      }
    }

    await adminClient.unsubscribe();

  } catch (error) {
    console.log("❌ Fatal error:", error.message);
    console.log("Stack:", error.stack);
  }
}

// Show usage information
console.log("🚀 COMBINED MARKET CREATOR & ORACLE FIXER");
console.log("This script will:");
console.log("1. Create a new highly speculative perpetual market with prelaunch oracle");
console.log("2. Configure full AMM liquidity with optimal spread settings");
console.log("3. Disable oracle staleness checks for immediate trading");
console.log();
console.log("📝 TO USE:");
console.log("1. Update MARKET_CONFIG section at the top of this script");
console.log("2. Set symbol, marketIndex, startPrice, and maxPrice");
console.log("3. Run the script");
console.log();
console.log("⚠️  IMPORTANT: This requires admin privileges");
console.log("Make sure you have the correct admin wallet at:", WALLET_PATH);
console.log();

// Run the combined script
createAndFixMarket().catch(console.error); 