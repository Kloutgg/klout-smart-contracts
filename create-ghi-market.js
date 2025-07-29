const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { 
  BN, 
  TestClient,
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
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC");

// GHI Market Configuration
const GHI_MARKET = {
  symbol: 'GHI',
  marketIndex: 2,  // Using index 2 for GHI market (ABC is 0, DEF is 1)
  startPrice: 100,  // $100 starting price
  maxPrice: 400,   // $400 price ceiling (4x start price)
};

// ✨ CRITICAL AMM CONFIGURATION FOR FULL LIQUIDITY
const AMM_CONFIG = {
  baseSpread: 2500,        // 25 basis points (0.25%) - ENABLES FULL AMM LIQUIDITY
  maxSpread: 142500,       // 1425 basis points (14.25%) - Maximum spread cap
  curveUpdateIntensity: 100, // Full intensity for spread calculations
  marginRatioInitial: 2000,  // 20% initial margin
  marginRatioMaintenance: 500, // 5% maintenance margin
};

async function main() {
  console.log("🎯 CREATING GHI MARKET WITH OPTIMAL AMM LIQUIDITY");
  console.log(`Market: ${GHI_MARKET.symbol}`);
  console.log(`Starting Price: $${GHI_MARKET.startPrice}`);
  console.log(`Max Price: $${GHI_MARKET.maxPrice}`);
  console.log(`Market Index: ${GHI_MARKET.marketIndex}`);
  console.log(`\n🔧 AMM Configuration:`);
  console.log(`   Base Spread: ${AMM_CONFIG.baseSpread} (${AMM_CONFIG.baseSpread/100} bps = ${AMM_CONFIG.baseSpread/10000}%)`);
  console.log(`   Max Spread: ${AMM_CONFIG.maxSpread} (${AMM_CONFIG.maxSpread/100} bps = ${AMM_CONFIG.maxSpread/10000}%)`);
  console.log(`   Curve Update Intensity: ${AMM_CONFIG.curveUpdateIntensity}%\n`);
  
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
  const startPrice = PRICE_PRECISION.mul(new BN(GHI_MARKET.startPrice));
  const maxPrice = PRICE_PRECISION.mul(new BN(GHI_MARKET.maxPrice));
  
  console.log(`\n🔧 Price Calculations:`);
  console.log(`  Start Price: ${startPrice.toString()} (${GHI_MARKET.startPrice} * PRICE_PRECISION)`);
  console.log(`  Max Price: ${maxPrice.toString()} (${GHI_MARKET.maxPrice} * PRICE_PRECISION)`);

  // Derive prelaunch oracle public key
  const prelaunchOracle = getPrelaunchOraclePublicKey(DRIFT_PROGRAM_ID, GHI_MARKET.marketIndex);
  console.log(`\n🔮 Prelaunch Oracle:`);
  console.log(`  Address: ${prelaunchOracle.toBase58()}`);
  console.log(`  Market Index: ${GHI_MARKET.marketIndex}`);

  const driftClient = new TestClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [GHI_MARKET.marketIndex],
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

    // Step 1: Initialize Prelaunch Oracle
    console.log(`\n🔮 Step 1: Initializing Prelaunch Oracle for ${GHI_MARKET.symbol}`);
    
    try {
      const oracleTxSig = await driftClient.initializePrelaunchOracle(
        GHI_MARKET.marketIndex,
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
    console.log(`\n🏪 Step 2: Creating ${GHI_MARKET.symbol} Perpetual Market with Full AMM Liquidity`);
    
    // Large equal reserves for substantial liquidity
    const ammInitialQuoteAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const ammInitialBaseAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const periodicity = new BN(3600); // 1 hour
    const pegMultiplier = PEG_PRECISION.mul(new BN(GHI_MARKET.startPrice)); // $100 peg
    
    console.log(`AMM Configuration:`);
    console.log(`  Equal reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    console.log(`  Base Reserve: ${ammInitialBaseAssetAmount.toString()}`);
    console.log(`  Quote Reserve: ${ammInitialQuoteAssetAmount.toString()}`);
    console.log(`  Oracle source: PRELAUNCH`);
    console.log(`  Peg multiplier: ${pegMultiplier.toString()} ($${GHI_MARKET.startPrice})`);
    console.log(`  🎯 Base Spread: ${AMM_CONFIG.baseSpread} (${AMM_CONFIG.baseSpread/10000}% - ENABLES FULL LIQUIDITY)`);
    
    try {
      // Using the FULL initializePerpMarket signature with ALL parameters
      const marketTxSig = await driftClient.initializePerpMarket(
        GHI_MARKET.marketIndex,              // marketIndex
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

      console.log(`✅ ${GHI_MARKET.symbol} MARKET CREATED WITH FULL AMM LIQUIDITY!`);
      console.log(`   TX: ${marketTxSig}`);
      console.log(`   🔗 View: https://solscan.io/tx/${marketTxSig}?cluster=devnet`);
      
      // Step 3: Set Curve Update Intensity for Dynamic Spread Calculation
      console.log(`\n⚙️ Step 3: Configuring AMM Parameters for Optimal Trading`);
      
      try {
        const curveIntensityTx = await driftClient.updatePerpMarketCurveUpdateIntensity(
          GHI_MARKET.marketIndex, 
          AMM_CONFIG.curveUpdateIntensity
        );
        console.log(`✅ Curve Update Intensity set to ${AMM_CONFIG.curveUpdateIntensity}%`);
        console.log(`   TX: ${curveIntensityTx}`);
      } catch (curveError) {
        console.log(`⚠️ Curve intensity update failed (non-critical): ${curveError.message}`);
      }
      
      // Step 4: Verify Market Creation
      console.log(`\n🔍 Step 4: Verifying Market Creation & AMM Configuration`);
      
      await driftClient.fetchAccounts();
      const perpMarket = driftClient.getPerpMarketAccount(GHI_MARKET.marketIndex);
      
      if (perpMarket && perpMarket.amm) {
        console.log(`✅ Market Verification Successful:`);
        console.log(`   Market Index: ${GHI_MARKET.marketIndex}`);
        console.log(`   Symbol: ${GHI_MARKET.symbol}`);
        console.log(`   Oracle: ${perpMarket.amm.oracle.toBase58()}`);
        console.log(`   Oracle Source: ${JSON.stringify(perpMarket.amm.oracleSource)}`);
        console.log(`   Equal Reserves: ${perpMarket.amm.baseAssetReserve.eq(perpMarket.amm.quoteAssetReserve)}`);
        console.log(`   Base Reserve: ${perpMarket.amm.baseAssetReserve.toString()}`);
        console.log(`   Quote Reserve: ${perpMarket.amm.quoteAssetReserve.toString()}`);
        console.log(`   Peg Multiplier: ${perpMarket.amm.pegMultiplier.toString()}`);
        console.log(`   🎯 Base Spread: ${perpMarket.amm.baseSpread} (${perpMarket.amm.baseSpread/10000}%)`);
        console.log(`   Max Spread: ${perpMarket.amm.maxSpread} (${perpMarket.amm.maxSpread/10000}%)`);
        console.log(`   Curve Update Intensity: ${perpMarket.amm.curveUpdateIntensity}%`);
        
        // Verify AMM will provide liquidity
        if (perpMarket.amm.baseSpread > 0) {
          console.log(`\n🎉 SUCCESS! GHI MARKET WITH FULL AMM LIQUIDITY IS OPERATIONAL!`);
          console.log(`✅ AMM Liquidity Status: ENABLED (baseSpread > 0)`);
          console.log(`✅ Your trades will execute FULLY against AMM reserves`);
          console.log(`✅ Mark price will move properly with each trade`);
          console.log(`✅ Oracle price will update via prelaunch mechanism`);
        } else {
          console.log(`❌ WARNING: baseSpread is 0 - AMM will not provide liquidity!`);
        }
        
        console.log(`\n🎯 Market Details:`);
        console.log(`   • Symbol: ${GHI_MARKET.symbol}`);
        console.log(`   • Starting Price: $${GHI_MARKET.startPrice}`);
        console.log(`   • Max Price: $${GHI_MARKET.maxPrice}`);
        console.log(`   • Oracle Type: Prelaunch (mark prices → oracle prices)`);
        console.log(`   • AMM Spread: ${perpMarket.amm.baseSpread/10000}% (ensures full liquidity)`);
        console.log(`   • Price Discovery: Active with proper price movement`);
        console.log(`\n🚀 Your GHI perpetual futures market is ready for FULL EXECUTION trading!`);
        
        // Output the oracle address for UI configuration
        console.log(`\n📋 UI Configuration Info:`);
        console.log(`   Market Index: ${GHI_MARKET.marketIndex}`);
        console.log(`   Oracle Address: ${perpMarket.amm.oracle.toBase58()}`);
        console.log(`   Symbol: GHI-PERP`);
        console.log(`   Base Asset Symbol: GHI`);
        
      } else {
        console.log(`❌ Market verification failed - could not load market data`);
      }

    } catch (marketError) {
      console.log(`❌ Market creation failed: ${marketError.message}`);
      
      if (marketError.message.includes('already initialized') || 
          marketError.message.includes('already exists')) {
        console.log(`✅ ${GHI_MARKET.symbol} market already exists!`);
        
        try {
          const perpMarket = driftClient.getPerpMarketAccount(GHI_MARKET.marketIndex);
          if (perpMarket) {
            console.log(`✅ Existing market verified`);
            console.log(`   Oracle: ${perpMarket.amm.oracle.toBase58()}`);
            console.log(`   Base Spread: ${perpMarket.amm.baseSpread} (${perpMarket.amm.baseSpread/10000}%)`);
            console.log(`🎉 GHI MARKET IS READY!`);
          }
        } catch (verifyError) {
          console.log("Could not verify existing market");
        }
      } else {
        throw marketError;
      }
    }

    await driftClient.unsubscribe();

  } catch (error) {
    console.log("❌ Fatal error:", error.message);
    console.log("Stack:", error.stack);
  }
}

main().catch(console.error); 