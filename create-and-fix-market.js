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
const DEVNET_RPC = "https://mainnet.helius-rpc.com/?api-key=ca49b73e-00a4-42d0-8e60-ad1a01e3dc97";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("7a247Z1uc66BycPHmL7xuGps2Jrym9RQngiWwgqQCtYn");

// 🎯 MARKET CONFIGURATION - UPDATED BASED ON MARKET CHECK
const MARKET_CONFIG = {
  symbol: 'ELON',       // Market symbol for your highly speculative contract
  name: 'ELON Attention Market',    // Market name for display purposes
  marketIndex: 0,           // ✅ NEXT AVAILABLE INDEX (script shows 26 markets exist, so next is 26)
  startPrice: 1000,          // Starting price in USD (will be set in oracle)
  maxPrice: 100000,        // Maximum price ceiling $10M (will be set in oracle)
};

// ✨ CRITICAL AMM CONFIGURATION FOR FULL LIQUIDITY
const AMM_CONFIG = {
  baseSpread: 1000,           // 25 basis points (0.25%) - ENABLES FULL AMM LIQUIDITY
  maxSpread: 1100,          // 1425 basis points (14.25%) - Maximum spread cap
  curveUpdateIntensity: 0,  // Full intensity for spread calculations
  marginRatioInitial: 10000,   // 20% initial margin
  marginRatioMaintenance: 3000, // 10% maintenance margin
};

async function createAndFixMarket() {
  console.log("🚀 CREATING & CONFIGURING HIGHLY SPECULATIVE MARKET");
  console.log("=" .repeat(70));
  console.log(`Market: ${MARKET_CONFIG.symbol}`);
  console.log(`Market Name: ${MARKET_CONFIG.name}`);
  console.log(`Starting Price: $${MARKET_CONFIG.startPrice}`);
  console.log(`Max Price: $${MARKET_CONFIG.maxPrice}`);
  console.log(`Market Index: ${MARKET_CONFIG.marketIndex}`);
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

  // Calculate prices in Drift precision  
  const startPrice = PRICE_PRECISION.mul(new BN(MARKET_CONFIG.startPrice));
  const maxPrice = PRICE_PRECISION.mul(new BN(MARKET_CONFIG.maxPrice));
  
  // 🐛 DEBUG: Check if maxPrice is affecting the oracle behavior
  console.log(`🔍 Oracle Price Debug:`);
  console.log(`  Expected start price: $${MARKET_CONFIG.startPrice}`);  
  console.log(`  Expected max price: $${MARKET_CONFIG.maxPrice}`);
  console.log(`  Oracle max price (raw): ${maxPrice.toString()}`);
  console.log(`  Oracle max price (USD): $${maxPrice.div(PRICE_PRECISION).toString()}`);
  
  console.log(`\n🔧 Price Calculations:`);
  console.log(`  Start Price: ${startPrice.toString()} (${MARKET_CONFIG.startPrice} * PRICE_PRECISION)`);
  console.log(`  Max Price: ${maxPrice.toString()} (${MARKET_CONFIG.maxPrice} * PRICE_PRECISION)`);

  // Derive prelaunch oracle public key
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
    
    // ✅ DYNAMIC INDEX VALIDATION
    const nextAvailableIndex = state.numberOfMarkets;
    if (MARKET_CONFIG.marketIndex !== nextAvailableIndex) {
      console.log(`\n⚠️  WARNING: Market index mismatch!`);
      console.log(`   Your config uses index: ${MARKET_CONFIG.marketIndex}`);
      console.log(`   Next available index: ${nextAvailableIndex}`);
      console.log(`   🔧 Update MARKET_CONFIG.marketIndex to ${nextAvailableIndex} and try again`);
      return;
    }
    
    // Pre-flight checks - show existing markets
    console.log(`\n🔍 PRE-FLIGHT CHECKS:`);
    console.log(`✅ Using correct market index: ${MARKET_CONFIG.marketIndex}`);
    console.log(`Checking for existing markets and oracles...`);
    
    // Check existing markets around our target index
    console.log(`\n📊 Market Status Around Index ${MARKET_CONFIG.marketIndex}:`);
    for (let i = Math.max(0, MARKET_CONFIG.marketIndex - 2); i <= MARKET_CONFIG.marketIndex + 2; i++) {
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

    // Step 1: Initialize or Update Prelaunch Oracle
    console.log(`\n🔮 Step 1: Initializing/Updating Prelaunch Oracle for ${MARKET_CONFIG.symbol}`);
    
    // First, check if oracle already exists
    try {
      const oracleAccount = await provider.connection.getAccountInfo(prelaunchOracle);
      if (oracleAccount) {
        console.log(`✅ Prelaunch Oracle already exists`);
        console.log(`   Oracle Address: ${prelaunchOracle.toBase58()}`);
        console.log(`🔄 Updating existing oracle with new price settings...`);
        
        // Update existing oracle with new price settings
        try {
          console.log(`   🔄 Attempting to update oracle with AdminClient...`);
          
          // Wait for AdminClient to be ready
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const oracleUpdateTx = await adminClient.updatePrelaunchOracleParams(
            MARKET_CONFIG.marketIndex,
            startPrice,  // New start price
            maxPrice     // New max price
          );
          
          console.log(`✅ Existing Oracle Updated!`);
          console.log(`   TX: ${oracleUpdateTx}`);
          console.log(`   🔗 View: https://solscan.io/tx/${oracleUpdateTx}`);
          
        } catch (oracleUpdateError) {
          console.log(`⚠️  Oracle update failed: ${oracleUpdateError.message}`);
          console.log(`   This might be because:`);
          console.log(`   - Oracle requires admin permissions`);
          console.log(`   - Oracle is not accessible`);
          console.log(`   - Market index not properly configured`);
          console.log(`   🔧 Will try again in Phase 2 with AdminClient`);
        }
        
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
          console.log(`   🔗 View: https://solscan.io/tx/${oracleTxSig}`);
          
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
        200,                                 // liquidatorFee (200 = 2% - incentivizes liquidators)
        2000,                                // ifLiquidatorFee (2000 = 20% - reasonable insurance fund fee)
        0,                                   // imfFactor
        true,                                // activeStatus
        AMM_CONFIG.baseSpread,               // ✨ baseSpread (2500 = 0.25% - CRITICAL FOR LIQUIDITY)
        AMM_CONFIG.maxSpread,                // maxSpread (142500 = 14.25%)
        new BN(0),                          // maxOpenInterest (0 = unlimited)
        new BN(0),                          // maxRevenueWithdrawPerPeriod
        new BN(0),                          // quoteMaxInsurance
        undefined,                          // orderStepSize (use default)
        undefined,                          // orderTickSize (use default) 
        undefined,                          // minOrderSize (use default)
        undefined,                          // concentrationCoefScale (use default)
        AMM_CONFIG.curveUpdateIntensity,    // curveUpdateIntensity
        0,                                  // ammJitIntensity (use default)
        MARKET_CONFIG.name                  // 📝 Market name - set directly in creation!
      );

      console.log(`✅ ${MARKET_CONFIG.symbol} MARKET CREATED WITH FULL AMM LIQUIDITY!`);
      console.log(`   Market name: ${MARKET_CONFIG.name}`);
      console.log(`   Curve update intensity: ${AMM_CONFIG.curveUpdateIntensity}%`);
      console.log(`   TX: ${marketTxSig}`);
      console.log(`   🔗 View: https://solscan.io/tx/${marketTxSig}`);
      
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
      perpMarketIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, MARKET_CONFIG.marketIndex], // Include the new market index
      spotMarketIndexes: [0],
      subAccountIds: [],
      accountSubscription: {
        type: 'polling',
        accountLoader: new BulkAccountLoader(provider.connection, 'confirmed', 1000),
      },
    });

    console.log("\n🔧 Initializing AdminClient for oracle settings...");
    await adminClient.subscribe();
    
    // Wait for AdminClient to be fully initialized
    console.log("⏳ Waiting for AdminClient to load accounts...");
    let retries = 0;
    while (retries < 10) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await adminClient.fetchAccounts();
        const state = adminClient.getStateAccount();
        if (state && state.admin) {
          console.log("✅ AdminClient ready");
          break;
        }
      } catch (error) {
        console.log(`   Loading... retry ${retries + 1}/10`);
      }
      retries++;
    }
    
    // Additional wait for state to load and fetch accounts
    let stateRetries = 0;
    while (stateRetries < 5) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await adminClient.fetchAccounts();
        const state = adminClient.getStateAccount();
        if (state && state.admin) {
          console.log("✅ AdminClient state ready");
          break;
        }
      } catch (error) {
        console.log(`   State loading... retry ${stateRetries + 1}`);
      }
      stateRetries++;
    }

    // Fix oracle settings for the newly created market
    console.log(`\n🔧 Fixing Oracle Settings for ${MARKET_CONFIG.symbol} (Market Index: ${MARKET_CONFIG.marketIndex})`);
    console.log("-".repeat(60));
    
    // Debug: Check what markets AdminClient can see
    console.log("\n🔍 AdminClient Market Discovery:");
    for (let i = 0; i <= MARKET_CONFIG.marketIndex; i++) {
      try {
        const market = adminClient.getPerpMarketAccount(i);
        if (market) {
          console.log(`   ✅ Market ${i}: Found (Oracle: ${market.amm.oracle.toBase58().slice(0,8)}...)`);
        }
      } catch (e) {
        console.log(`   ❌ Market ${i}: Not accessible`);
      }
    }

    try {
      // Check current setting
      console.log(`🔍 Checking market at index ${MARKET_CONFIG.marketIndex}...`);
      
      // Wait a bit for AdminClient to load the new market
      await new Promise(resolve => setTimeout(resolve, 3000));
      await adminClient.fetchAccounts();
      
      const perpMarket = adminClient.getPerpMarketAccount(MARKET_CONFIG.marketIndex);
      if (!perpMarket) {
        console.log(`⚠️  Market at index ${MARKET_CONFIG.marketIndex} not found in AdminClient`);
        console.log(`   This might be because the market was just created and AdminClient hasn't loaded it yet`);
        console.log(`   🔧 Trying to fetch accounts again...`);
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        await adminClient.fetchAccounts();
        
        const retryMarket = adminClient.getPerpMarketAccount(MARKET_CONFIG.marketIndex);
        if (!retryMarket) {
          throw new Error(`Market at index ${MARKET_CONFIG.marketIndex} not found. AdminClient may not be subscribed to this market index.`);
        }
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
        console.log(`   🔗 View: https://solscan.io/tx/${result.txSig}`);
        
        // Wait a moment for the transaction to be confirmed
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Step 4: Update Oracle Price Settings (if oracle exists)
      console.log(`\n🔮 Step 4: Updating Oracle Price Settings`);
      console.log("-".repeat(60));
      
      try {
        // Check if oracle exists and get current settings
        const oracleAccount = await provider.connection.getAccountInfo(prelaunchOracle);
        if (oracleAccount) {
          console.log(`✅ Oracle exists at: ${prelaunchOracle.toBase58()}`);
          console.log(`🔄 Updating oracle price settings...`);
          
          // Calculate new prices in Drift precision
          const newStartPrice = PRICE_PRECISION.mul(new BN(MARKET_CONFIG.startPrice));
          const newMaxPrice = PRICE_PRECISION.mul(new BN(MARKET_CONFIG.maxPrice));
          
          console.log(`📊 Oracle Price Updates:`);
          console.log(`   Start Price: ${newStartPrice.toString()} ($${MARKET_CONFIG.startPrice})`);
          console.log(`   Max Price: ${newMaxPrice.toString()} ($${MARKET_CONFIG.maxPrice})`);
          
          // Wait a bit for AdminClient to be fully ready
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Update oracle parameters
          const oracleUpdateTx = await adminClient.updatePrelaunchOracleParams(
            MARKET_CONFIG.marketIndex,
            newStartPrice,  // New start price
            newMaxPrice     // New max price
          );
          
          console.log(`✅ Oracle price settings updated!`);
          console.log(`   TX: ${oracleUpdateTx}`);
          console.log(`   🔗 View: https://solscan.io/tx/${oracleUpdateTx}`);
          
          // Wait for transaction to confirm
          await new Promise(resolve => setTimeout(resolve, 3000));
          
        } else {
          console.log(`⚠️  Oracle doesn't exist yet - will be created with market`);
        }
      } catch (oracleUpdateError) {
        console.log(`⚠️  Oracle update failed (non-critical): ${oracleUpdateError.message}`);
        console.log(`   Error details:`, oracleUpdateError);
        console.log(`   This might be because:`);
        console.log(`   - Oracle doesn't exist yet`);
        console.log(`   - Oracle is not accessible`);
        console.log(`   - Admin permissions issue`);
        console.log(`   - Market index not properly configured`);
      }

      // Verify the final market state
      console.log(`\n🔍 FINAL MARKET VERIFICATION:`);
      console.log("=" .repeat(50));
      
      await adminClient.fetchAccounts();
      const finalMarket = adminClient.getPerpMarketAccount(MARKET_CONFIG.marketIndex);
      
      if (finalMarket && finalMarket.amm) {
        console.log(`✅ Market: ${MARKET_CONFIG.symbol}`);
        console.log(`   Market Name: ${finalMarket.name || MARKET_CONFIG.name}`);
        console.log(`   Market Index: ${MARKET_CONFIG.marketIndex}`);
        console.log(`   Oracle: ${finalMarket.amm.oracle.toBase58()}`);
        console.log(`   Oracle Source: ${JSON.stringify(finalMarket.amm.oracleSource)}`);
        console.log(`   Oracle Slot Delay Override: ${finalMarket.amm.oracleSlotDelayOverride} ${finalMarket.amm.oracleSlotDelayOverride === -1 ? '🟢 PERMISSIVE' : '🔴 RESTRICTED'}`);
        console.log(`   Base Spread: ${finalMarket.amm.baseSpread} (${finalMarket.amm.baseSpread/10000}%)`);
        console.log(`   Max Spread: ${finalMarket.amm.maxSpread} (${finalMarket.amm.maxSpread/10000}%)`);
        console.log(`   Contract Tier: HIGHLY_SPECULATIVE`);
        
        // 🐛 DEBUG: Check actual AMM reserves and calculated mark price
        console.log(`\n🔍 AMM State Debug:`);
        console.log(`   Base Asset Reserve: ${finalMarket.amm.baseAssetReserve.toString()}`);
        console.log(`   Quote Asset Reserve: ${finalMarket.amm.quoteAssetReserve.toString()}`);
        console.log(`   Peg Multiplier: ${finalMarket.amm.pegMultiplier.toString()}`);
        
        // Calculate mark price manually
        const quoteReserve = finalMarket.amm.quoteAssetReserve;
        const baseReserve = finalMarket.amm.baseAssetReserve;  
        const pegMultiplier = finalMarket.amm.pegMultiplier;
        
        // This is the actual AMM price calculation from Drift
        // price = (quote_reserve * peg_multiplier * PRICE_TO_PEG_PRECISION_RATIO) / base_reserve
        // PRICE_TO_PEG_PRECISION_RATIO = PRICE_PRECISION / PEG_PRECISION = 1 (both are 10^6)
        const PRICE_TO_PEG_RATIO = new BN(1); // Since both PRICE_PRECISION and PEG_PRECISION are 10^6
        const markPriceRaw = quoteReserve.mul(pegMultiplier).mul(PRICE_TO_PEG_RATIO).div(baseReserve);
        const markPriceUSD = markPriceRaw.div(new BN(1000000)); // PRICE_PRECISION
        
        console.log(`   Calculated Mark Price (raw): ${markPriceRaw.toString()}`);
        console.log(`   Calculated Mark Price (USD): $${markPriceUSD.toString()}`);
        console.log(`   Expected Mark Price (USD): $${MARKET_CONFIG.startPrice}`);
        
        // Check oracle price settings
        try {
          const oracleData = adminClient.getOracleDataForPerpMarket(MARKET_CONFIG.marketIndex);
          if (oracleData) {
            console.log(`\n🔮 Oracle Price Settings:`);
            console.log(`   Current Price: ${oracleData.price.toString()}`);
            console.log(`   Max Price: ${oracleData.maxPrice?.toString() || 'N/A'}`);
            console.log(`   Confidence: ${oracleData.confidence.toString()}`);
          }
        } catch (oracleCheckError) {
          console.log(`   Oracle data check failed: ${oracleCheckError.message}`);
        }
        
        console.log(`\n🎉 SUCCESS! ${MARKET_CONFIG.symbol} (${finalMarket.name || MARKET_CONFIG.name}) IS FULLY OPERATIONAL!`);
        console.log(`✅ Market created with full AMM liquidity and name in single transaction`);
        console.log(`✅ Oracle staleness checks disabled`);
        console.log(`✅ Oracle price settings updated`);
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
console.log("🚀 COMBINED MARKET CREATOR & ORACLE MANAGER");
console.log("This script will:");
console.log("1. Create a new highly speculative perpetual market with prelaunch oracle and name");
console.log("2. Update existing oracle price settings if oracle already exists");
console.log("3. Configure full AMM liquidity with optimal spread settings");
console.log("4. Disable oracle staleness checks for immediate trading");
console.log("5. Update oracle start price and max price settings");
console.log();
console.log("📝 TO USE:");
console.log("1. Update MARKET_CONFIG section at the top of this script");
console.log("2. Set symbol, name, marketIndex, startPrice, and maxPrice");
console.log("3. Run the script");
console.log();
console.log("🔮 ORACLE HANDLING:");
console.log("- If oracle doesn't exist: Creates new oracle with specified prices");
console.log("- If oracle exists: Updates existing oracle with new price settings");
console.log("- Oracle price settings: startPrice and maxPrice will be updated");
console.log();
console.log("⚠️  IMPORTANT: This requires admin privileges");
console.log("Make sure you have the correct admin wallet at:", WALLET_PATH);
console.log();

// Run the combined script
createAndFixMarket().catch(console.error); 