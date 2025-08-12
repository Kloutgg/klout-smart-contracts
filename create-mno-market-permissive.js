const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
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

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("7a247Z1uc66BycPHmL7xuGps2Jrym9RQngiWwgqQCtYn");
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC");

// MNO Market Configuration  
const MNO_MARKET = {
  symbol: 'MNO',
  marketIndex: 4,  // Using index 4 (ABC=0, DEF=1, GHI=2, JKL=3 exist, MNO=4 available)
  startPrice: 75,  // $75 starting price
  maxPrice: 300,   // $300 price ceiling (4x start price)
};

// ✨ CRITICAL AMM CONFIGURATION FOR FULL LIQUIDITY + PERMISSIVE ORACLE
const AMM_CONFIG = {
  baseSpread: 2500,        // 25 basis points (0.25%) - ENABLES FULL AMM LIQUIDITY
  maxSpread: 142500,       // 1425 basis points (14.25%) - Maximum spread cap
  curveUpdateIntensity: 100, // Full intensity for spread calculations
  marginRatioInitial: 2000,  // 20% initial margin
  marginRatioMaintenance: 500, // 5% maintenance margin
};

// 🚀 PERMISSIVE ORACLE CONFIGURATION
const ORACLE_CONFIG = {
  slotDelayOverride: -1,    // -1 disables staleness checks for immediate execution
  description: "Highly permissive oracle settings for prelaunch markets"
};

async function main() {
  console.log("🚀 CREATING MNO MARKET WITH PERMISSIVE ORACLE & FULL AMM LIQUIDITY");
  console.log("=".repeat(70));
  console.log(`Market: ${MNO_MARKET.symbol}`);
  console.log(`Starting Price: $${MNO_MARKET.startPrice}`);
  console.log(`Max Price: $${MNO_MARKET.maxPrice}`);
  console.log(`Market Index: ${MNO_MARKET.marketIndex}`);
  console.log(`\n🔧 AMM Configuration:`);
  console.log(`   Base Spread: ${AMM_CONFIG.baseSpread} (${AMM_CONFIG.baseSpread/100} bps = ${AMM_CONFIG.baseSpread/10000}%)`);
  console.log(`   Max Spread: ${AMM_CONFIG.maxSpread} (${AMM_CONFIG.maxSpread/100} bps = ${AMM_CONFIG.maxSpread/10000}%)`);
  console.log(`   Curve Update Intensity: ${AMM_CONFIG.curveUpdateIntensity}%`);
  console.log(`\n🔮 Oracle Configuration:`);
  console.log(`   Slot Delay Override: ${ORACLE_CONFIG.slotDelayOverride} (disables staleness checks)`);
  console.log(`   Purpose: Enables immediate placeAndTakePerpOrder execution\n`);
  
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  console.log("📝 Admin Wallet:", keypair.publicKey.toBase58());

  const provider = new anchor.AnchorProvider(
    new Connection(DEVNET_RPC, 'confirmed'),
    new Wallet(keypair),
    { commitment: 'confirmed', preflightCommitment: 'confirmed' }
  );
  
  console.log("💰 Balance:", ((await provider.connection.getBalance(keypair.publicKey)) / 1e9).toFixed(2), "SOL");

  // Calculate prices in Drift precision
  const startPrice = PRICE_PRECISION.mul(new BN(MNO_MARKET.startPrice));
  const maxPrice = PRICE_PRECISION.mul(new BN(MNO_MARKET.maxPrice));
  
  console.log(`\n🔧 Price Calculations:`);
  console.log(`  Start Price: ${startPrice.toString()} (${MNO_MARKET.startPrice} * PRICE_PRECISION)`);
  console.log(`  Max Price: ${maxPrice.toString()} (${MNO_MARKET.maxPrice} * PRICE_PRECISION)`);

  // Derive prelaunch oracle public key
  const prelaunchOracle = getPrelaunchOraclePublicKey(DRIFT_PROGRAM_ID, MNO_MARKET.marketIndex);
  console.log(`\n🔮 Prelaunch Oracle:`);
  console.log(`  Address: ${prelaunchOracle.toBase58()}`);
  console.log(`  Market Index: ${MNO_MARKET.marketIndex}`);

  // Create TestClient for market creation
  const driftClient = new TestClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [MNO_MARKET.marketIndex],
    spotMarketIndexes: [0],
    oracleInfos: [
      { publicKey: prelaunchOracle, source: OracleSource.Prelaunch }
    ],
    accountSubscription: {
      type: 'polling',
      accountLoader: new BulkAccountLoader(provider.connection, 'confirmed', 0),
    },
  });

  // Create AdminClient for oracle configuration
  const adminClient = new AdminClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { 
      commitment: 'confirmed',
      preflightCommitment: 'confirmed'
    },
    activeSubAccountId: 0,
    perpMarketIndexes: [0, 1, 2, 3, 4], // Include all markets
    spotMarketIndexes: [0],
    subAccountIds: [],
    accountSubscription: {
      type: 'polling',
      accountLoader: new BulkAccountLoader(provider.connection, 'confirmed', 1000),
    },
  });

  try {
    // Initialize both clients
    console.log("\n🔧 Initializing Drift clients...");
    await driftClient.subscribe();
    await driftClient.fetchAccounts();
    
    await adminClient.subscribe();
    // Wait for admin client state to load
    let adminState = null;
    let retries = 0;
    while (retries < 5) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        adminState = adminClient.getStateAccount();
        if (adminState && adminState.admin) {
          console.log("✅ AdminClient ready");
          break;
        }
      } catch (error) {
        console.log(`   AdminClient loading... retry ${retries + 1}`);
      }
      retries++;
    }
    
    const state = driftClient.getStateAccount();
    console.log(`Current state: ${state.numberOfMarkets} perp markets, ${state.numberOfSpotMarkets} spot markets`);

    // Step 1: Initialize Prelaunch Oracle
    console.log(`\n🔮 Step 1: Initializing Prelaunch Oracle for ${MNO_MARKET.symbol}`);
    
    try {
      const oracleTxSig = await driftClient.initializePrelaunchOracle(
        MNO_MARKET.marketIndex,
        startPrice,
        maxPrice
      );
      
      console.log(`✅ Prelaunch Oracle Initialized!`);
      console.log(`   TX: ${oracleTxSig}`);
      console.log(`   🔗 View: https://solscan.io/tx/${oracleTxSig}?cluster=devnet`);
      
    } catch (oracleError) {
      if (oracleError.message.includes('already initialized') || 
          oracleError.message.includes('already exists')) {
        console.log(`✅ Prelaunch Oracle already exists`);
      } else {
        console.log(`❌ Oracle initialization failed: ${oracleError.message}`);
        throw oracleError;
      }
    }

    // Step 2: Create Perpetual Market with FULL AMM CONFIGURATION
    console.log(`\n🏪 Step 2: Creating ${MNO_MARKET.symbol} Perpetual Market with Full AMM Liquidity`);
    
    // Large equal reserves for substantial liquidity
    const ammInitialQuoteAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const ammInitialBaseAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const periodicity = new BN(3600); // 1 hour
    const pegMultiplier = PEG_PRECISION.mul(new BN(MNO_MARKET.startPrice)); // $75 peg
    
    console.log(`AMM Configuration:`);
    console.log(`  Equal reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    console.log(`  Base Reserve: ${ammInitialBaseAssetAmount.toString()}`);
    console.log(`  Quote Reserve: ${ammInitialQuoteAssetAmount.toString()}`);
    console.log(`  Oracle source: PRELAUNCH`);
    console.log(`  Peg multiplier: ${pegMultiplier.toString()} ($${MNO_MARKET.startPrice})`);
    console.log(`  🎯 Base Spread: ${AMM_CONFIG.baseSpread} (${AMM_CONFIG.baseSpread/10000}% - ENABLES FULL LIQUIDITY)`);
    
    let marketTxSig;
    try {
      // Create the perpetual market
      marketTxSig = await driftClient.initializePerpMarket(
        MNO_MARKET.marketIndex,              // marketIndex
        prelaunchOracle,                     // priceOracle - Our prelaunch oracle
        ammInitialBaseAssetAmount,           // baseAssetReserve
        ammInitialQuoteAssetAmount,          // quoteAssetReserve  
        periodicity,                         // periodicity
        pegMultiplier,                       // pegMultiplier
        OracleSource.Prelaunch,              // oracleSource - Critical: Use prelaunch oracle source
        ContractTier.A,                      // contractTier
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

      console.log(`✅ ${MNO_MARKET.symbol} MARKET CREATED WITH FULL AMM LIQUIDITY!`);
      console.log(`   TX: ${marketTxSig}`);
      console.log(`   🔗 View: https://solscan.io/tx/${marketTxSig}?cluster=devnet`);

    } catch (marketError) {
      if (marketError.message.includes('already initialized') || 
          marketError.message.includes('already exists')) {
        console.log(`✅ ${MNO_MARKET.symbol} market already exists!`);
        marketTxSig = 'existing';
      } else {
        throw marketError;
      }
    }

    // Step 3: 🚀 CONFIGURE PERMISSIVE ORACLE SETTINGS
    console.log(`\n🔮 Step 3: Configuring Permissive Oracle Settings for Immediate Execution`);
    
    try {
      // Wait a moment for market to be fully created
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log(`Setting oracle_slot_delay_override to ${ORACLE_CONFIG.slotDelayOverride}...`);
      console.log(`This enables immediate placeAndTakePerpOrder execution via AMM`);
      
      // Manual instruction building since AdminClient method had issues
      const perpMarketPublicKey = await driftClient.getPerpMarketPublicKey(MNO_MARKET.marketIndex);
      const statePublicKey = await adminClient.getStatePublicKey();
      
      const ix = await adminClient.program.methods
        .updatePerpMarketOracleSlotDelayOverride(ORACLE_CONFIG.slotDelayOverride)
        .accounts({
          admin: adminClient.wallet.publicKey,
          state: statePublicKey,
          perpMarket: perpMarketPublicKey,
        })
        .instruction();
      
      const tx = await adminClient.buildTransaction(ix);
      const result = await adminClient.sendTransaction(tx, [], adminClient.opts);
      const oracleConfigTx = result.txSig;
      
      console.log(`✅ Oracle constraints configured for immediate execution!`);
      console.log(`   TX: ${oracleConfigTx}`);
      console.log(`   🔗 View: https://solscan.io/tx/${oracleConfigTx}?cluster=devnet`);
      
    } catch (oracleConfigError) {
      console.log(`⚠️ Oracle configuration failed: ${oracleConfigError.message}`);
      console.log(`Market created successfully, but oracle may not be fully permissive`);
    }

    // Step 4: Set Curve Update Intensity
    console.log(`\n⚙️ Step 4: Configuring AMM Parameters for Optimal Trading`);
    
    try {
      const curveIntensityTx = await driftClient.updatePerpMarketCurveUpdateIntensity(
        MNO_MARKET.marketIndex, 
        AMM_CONFIG.curveUpdateIntensity
      );
      console.log(`✅ Curve Update Intensity set to ${AMM_CONFIG.curveUpdateIntensity}%`);
      console.log(`   TX: ${curveIntensityTx}`);
    } catch (curveError) {
      console.log(`⚠️ Curve intensity update failed (non-critical): ${curveError.message}`);
    }
    
    // Step 5: Verify Market Creation & Configuration
    console.log(`\n🔍 Step 5: Verifying Market Creation & Permissive Configuration`);
    
    await driftClient.fetchAccounts();
    const perpMarket = driftClient.getPerpMarketAccount(MNO_MARKET.marketIndex);
    
    if (perpMarket && perpMarket.amm) {
      console.log(`✅ Market Verification Successful:`);
      console.log(`   Market Index: ${MNO_MARKET.marketIndex}`);
      console.log(`   Symbol: ${MNO_MARKET.symbol}`);
      console.log(`   Oracle: ${perpMarket.amm.oracle.toBase58()}`);
      console.log(`   Oracle Source: ${JSON.stringify(perpMarket.amm.oracleSource)}`);
      console.log(`   🔮 Oracle Slot Delay Override: ${perpMarket.amm.oracleSlotDelayOverride}`);
      console.log(`   Equal Reserves: ${perpMarket.amm.baseAssetReserve.eq(perpMarket.amm.quoteAssetReserve)}`);
      console.log(`   Base Reserve: ${perpMarket.amm.baseAssetReserve.toString()}`);
      console.log(`   Quote Reserve: ${perpMarket.amm.quoteAssetReserve.toString()}`);
      console.log(`   Peg Multiplier: ${perpMarket.amm.pegMultiplier.toString()}`);
      console.log(`   🎯 Base Spread: ${perpMarket.amm.baseSpread} (${perpMarket.amm.baseSpread/10000}%)`);
      console.log(`   Max Spread: ${perpMarket.amm.maxSpread} (${perpMarket.amm.maxSpread/10000}%)`);
      console.log(`   Curve Update Intensity: ${perpMarket.amm.curveUpdateIntensity}%`);
      
      // Verify configuration
      const isPermissive = perpMarket.amm.oracleSlotDelayOverride === ORACLE_CONFIG.slotDelayOverride;
      const hasLiquidity = perpMarket.amm.baseSpread > 0;
      
      if (isPermissive && hasLiquidity) {
        console.log(`\n🎉 SUCCESS! MNO MARKET WITH PERMISSIVE ORACLE & FULL AMM LIQUIDITY!`);
        console.log(`✅ Oracle Status: PERMISSIVE (slot delay override = ${perpMarket.amm.oracleSlotDelayOverride})`);
        console.log(`✅ AMM Liquidity Status: ENABLED (baseSpread > 0)`);
        console.log(`✅ placeAndTakePerpOrder: WILL WORK IMMEDIATELY`);
        console.log(`✅ Trades will execute instantly via AMM regardless of oracle staleness`);
        console.log(`✅ Mark price will move properly with each trade`);
        console.log(`✅ Oracle price will update via prelaunch mechanism`);
      } else {
        console.log(`\n⚠️ PARTIAL SUCCESS:`);
        console.log(`   Oracle Permissive: ${isPermissive ? '✅' : '❌'}`);
        console.log(`   AMM Liquidity: ${hasLiquidity ? '✅' : '❌'}`);
      }
      
      console.log(`\n🎯 Market Details:`);
      console.log(`   • Symbol: ${MNO_MARKET.symbol}`);
      console.log(`   • Starting Price: $${MNO_MARKET.startPrice}`);
      console.log(`   • Max Price: $${MNO_MARKET.maxPrice}`);
      console.log(`   • Oracle Type: Prelaunch (mark prices → oracle prices)`);
      console.log(`   • Oracle Config: Permissive (no staleness checks)`);
      console.log(`   • AMM Spread: ${perpMarket.amm.baseSpread/10000}% (ensures full liquidity)`);
      console.log(`   • Price Discovery: Active with proper price movement`);
      console.log(`\n🚀 Your MNO perpetual futures market is ready for IMMEDIATE EXECUTION trading!`);
      
      // Output the configuration for UI
      console.log(`\n📋 UI Configuration Info:`);
      console.log(`   Market Index: ${MNO_MARKET.marketIndex}`);
      console.log(`   Oracle Address: ${perpMarket.amm.oracle.toBase58()}`);
      console.log(`   Symbol: MNO-PERP`);
      console.log(`   Base Asset Symbol: MNO`);
      console.log(`   Full Name: 'MNO Prediction Market'`);
      
    } else {
      console.log(`❌ Market verification failed - could not load market data`);
    }

    await driftClient.unsubscribe();
    await adminClient.unsubscribe();

  } catch (error) {
    console.log("❌ Fatal error:", error.message);
    console.log("Stack:", error.stack);
    process.exit(1);
  }
}

main().catch(console.error); 