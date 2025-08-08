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
const DRIFT_PROGRAM_ID = new PublicKey("5jFCVBdddzyTjrWSEcY6bKGxq6J6aznuWQeLsxYinAMp");

// 📝 CUSTOMIZE THESE VALUES FOR EACH NEW MARKET
const MARKET_CONFIG = {
  symbol: 'YOUR_SYMBOL',     // e.g., 'MNO', 'PQR', etc.
  marketIndex: 4,            // Next available index (ABC=0, DEF=1, GHI=2, JKL=3)
  startPrice: 100,           // Starting price in USD
  maxPrice: 400,             // Maximum price in USD (typically 2-4x start price)
  fullName: 'Your Market Name Prediction Market', // For UI display
};

// ✨ STANDARD CONFIGURATION FOR PERMISSIVE PRELAUNCH MARKETS
const AMM_CONFIG = {
  baseSpread: 2500,        // 25 basis points (0.25%) - Enables full AMM liquidity
  maxSpread: 142500,       // 1425 basis points (14.25%) - Maximum spread cap
  curveUpdateIntensity: 100, // Full intensity for spread calculations
  marginRatioInitial: 2000,  // 20% initial margin
  marginRatioMaintenance: 500, // 5% maintenance margin
};

const ORACLE_CONFIG = {
  slotDelayOverride: -1,    // -1 disables staleness checks for immediate execution
};

async function main() {
  console.log(`🚀 CREATING ${MARKET_CONFIG.symbol} MARKET WITH PERMISSIVE ORACLE & FULL AMM LIQUIDITY`);
  console.log("=".repeat(70));
  console.log(`Market: ${MARKET_CONFIG.symbol}`);
  console.log(`Starting Price: $${MARKET_CONFIG.startPrice}`);
  console.log(`Max Price: $${MARKET_CONFIG.maxPrice}`);
  console.log(`Market Index: ${MARKET_CONFIG.marketIndex}`);
  console.log(`Full Name: ${MARKET_CONFIG.fullName}`);
  
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

  // Calculate prices
  const startPrice = PRICE_PRECISION.mul(new BN(MARKET_CONFIG.startPrice));
  const maxPrice = PRICE_PRECISION.mul(new BN(MARKET_CONFIG.maxPrice));
  
  // Derive prelaunch oracle
  const prelaunchOracle = getPrelaunchOraclePublicKey(DRIFT_PROGRAM_ID, MARKET_CONFIG.marketIndex);
  console.log(`\n🔮 Prelaunch Oracle: ${prelaunchOracle.toBase58()}`);

  // Create clients
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
    // Initialize clients
    console.log("\n🔧 Initializing Drift clients...");
    await driftClient.subscribe();
    await driftClient.fetchAccounts();
    await adminClient.subscribe();
    
    // Wait for admin client
    let retries = 0;
    while (retries < 5) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const adminState = adminClient.getStateAccount();
        if (adminState && adminState.admin) {
          console.log("✅ AdminClient ready");
          break;
        }
      } catch (error) {
        console.log(`   AdminClient loading... retry ${retries + 1}`);
      }
      retries++;
    }

    // Step 1: Initialize Oracle
    console.log(`\n🔮 Step 1: Initializing Prelaunch Oracle for ${MARKET_CONFIG.symbol}`);
    try {
      const oracleTxSig = await driftClient.initializePrelaunchOracle(
        MARKET_CONFIG.marketIndex,
        startPrice,
        maxPrice
      );
      console.log(`✅ Prelaunch Oracle Initialized! TX: ${oracleTxSig}`);
    } catch (error) {
      if (error.message.includes('already initialized')) {
        console.log(`✅ Prelaunch Oracle already exists`);
      } else {
        throw error;
      }
    }

    // Step 2: Create Market
    console.log(`\n🏪 Step 2: Creating ${MARKET_CONFIG.symbol} Perpetual Market`);
    const ammInitialQuoteAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const ammInitialBaseAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const periodicity = new BN(3600);
    const pegMultiplier = PEG_PRECISION.mul(new BN(MARKET_CONFIG.startPrice));
    
    try {
      const marketTxSig = await driftClient.initializePerpMarket(
        MARKET_CONFIG.marketIndex,
        prelaunchOracle,
        ammInitialBaseAssetAmount,
        ammInitialQuoteAssetAmount,
        periodicity,
        pegMultiplier,
        OracleSource.Prelaunch,
        ContractTier.A,
        AMM_CONFIG.marginRatioInitial,
        AMM_CONFIG.marginRatioMaintenance,
        0, 10000, 0, true,
        AMM_CONFIG.baseSpread,
        AMM_CONFIG.maxSpread,
        new BN(0), new BN(0), new BN(0)
      );
      console.log(`✅ ${MARKET_CONFIG.symbol} MARKET CREATED! TX: ${marketTxSig}`);
    } catch (error) {
      if (error.message.includes('already initialized')) {
        console.log(`✅ ${MARKET_CONFIG.symbol} market already exists!`);
      } else {
        throw error;
      }
    }

    // Step 3: Configure Permissive Oracle
    console.log(`\n🔮 Step 3: Configuring Permissive Oracle Settings`);
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const perpMarketPublicKey = await driftClient.getPerpMarketPublicKey(MARKET_CONFIG.marketIndex);
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
      console.log(`✅ Oracle configured for immediate execution! TX: ${result.txSig}`);
    } catch (error) {
      console.log(`⚠️ Oracle configuration failed: ${error.message}`);
    }

    // Step 4: Set Curve Intensity
    console.log(`\n⚙️ Step 4: Setting Curve Update Intensity`);
    try {
      const curveIntensityTx = await driftClient.updatePerpMarketCurveUpdateIntensity(
        MARKET_CONFIG.marketIndex, 
        AMM_CONFIG.curveUpdateIntensity
      );
      console.log(`✅ Curve Update Intensity set! TX: ${curveIntensityTx}`);
    } catch (error) {
      console.log(`⚠️ Curve intensity update failed: ${error.message}`);
    }

    // Step 5: Verify and Output
    console.log(`\n🔍 Step 5: Verification & UI Configuration`);
    
    await driftClient.fetchAccounts();
    const perpMarket = driftClient.getPerpMarketAccount(MARKET_CONFIG.marketIndex);
    
    if (perpMarket && perpMarket.amm) {
      const isPermissive = perpMarket.amm.oracleSlotDelayOverride === ORACLE_CONFIG.slotDelayOverride;
      const hasLiquidity = perpMarket.amm.baseSpread > 0;
      
      console.log(`✅ Market Verification:`);
      console.log(`   Oracle Permissive: ${isPermissive ? '✅' : '❌'} (${perpMarket.amm.oracleSlotDelayOverride})`);
      console.log(`   AMM Liquidity: ${hasLiquidity ? '✅' : '❌'} (${perpMarket.amm.baseSpread})`);
      
      if (isPermissive && hasLiquidity) {
        console.log(`\n🎉 SUCCESS! ${MARKET_CONFIG.symbol} MARKET WITH IMMEDIATE EXECUTION READY!`);
      }
      
      console.log(`\n📋 UI Configuration - Add to sc-klout-ui/src/config/env.ts:`);
      console.log(`{`);
      console.log(`    fullName: '${MARKET_CONFIG.fullName}',`);
      console.log(`    category: ['Prediction', 'Custom'],`);
      console.log(`    symbol: '${MARKET_CONFIG.symbol}-PERP',`);
      console.log(`    baseAssetSymbol: '${MARKET_CONFIG.symbol}',`);
      console.log(`    marketIndex: ${MARKET_CONFIG.marketIndex},`);
      console.log(`    oracle: '${perpMarket.amm.oracle.toBase58()}',`);
      console.log(`    launchTs: ${Math.floor(Date.now() / 1000)},`);
      console.log(`    oracleSource: 'Prelaunch',`);
      console.log(`},`);
    }

    await driftClient.unsubscribe();
    await adminClient.unsubscribe();

  } catch (error) {
    console.log("❌ Fatal error:", error.message);
    process.exit(1);
  }
}

main().catch(console.error); 