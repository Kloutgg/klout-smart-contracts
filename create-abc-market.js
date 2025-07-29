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
  getPrelaunchOraclePublicKey
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC");

// ABC Market Configuration
const ABC_MARKET = {
  symbol: 'ABC',
  marketIndex: 0,  // Using index 0 for our dummy market
  startPrice: 1000,  // $1000 starting price
  maxPrice: 4000,    // $4000 price ceiling (4x start price)
};

async function main() {
  console.log("🎯 CREATING ABC MARKET WITH PRELAUNCH ORACLE");
  console.log(`Market: ${ABC_MARKET.symbol}`);
  console.log(`Starting Price: $${ABC_MARKET.startPrice}`);
  console.log(`Max Price: $${ABC_MARKET.maxPrice}`);
  console.log(`Market Index: ${ABC_MARKET.marketIndex}\n`);
  
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
  const startPrice = PRICE_PRECISION.mul(new BN(ABC_MARKET.startPrice));
  const maxPrice = PRICE_PRECISION.mul(new BN(ABC_MARKET.maxPrice));
  
  console.log(`\n🔧 Price Calculations:`);
  console.log(`  Start Price: ${startPrice.toString()} (${ABC_MARKET.startPrice} * PRICE_PRECISION)`);
  console.log(`  Max Price: ${maxPrice.toString()} (${ABC_MARKET.maxPrice} * PRICE_PRECISION)`);

  // Derive prelaunch oracle public key
  const prelaunchOracle = getPrelaunchOraclePublicKey(DRIFT_PROGRAM_ID, ABC_MARKET.marketIndex);
  console.log(`\n🔮 Prelaunch Oracle:`);
  console.log(`  Address: ${prelaunchOracle.toBase58()}`);
  console.log(`  Market Index: ${ABC_MARKET.marketIndex}`);

  const driftClient = new TestClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [ABC_MARKET.marketIndex],
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
    // Step 1: Initialize Drift if needed
    try {
      await driftClient.initialize(USDC_MINT, true);
      console.log("\n✅ Drift initialized");
    } catch (initError) {
      if (initError.message.includes('already initialized')) {
        console.log("\n✅ Drift already initialized");
      } else {
        throw initError;
      }
    }

    await driftClient.subscribe();
    await driftClient.fetchAccounts();
    
    const state = driftClient.getStateAccount();
    console.log(`Current state: ${state.numberOfMarkets} perp markets, ${state.numberOfSpotMarkets} spot markets`);

    // Step 2: Initialize Prelaunch Oracle
    console.log(`\n🔮 Step 1: Initializing Prelaunch Oracle for ${ABC_MARKET.symbol}`);
    
    try {
      const oracleTxSig = await driftClient.initializePrelaunchOracle(
        ABC_MARKET.marketIndex,
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

    // Step 3: Create Perpetual Market
    console.log(`\n🏪 Step 2: Creating ${ABC_MARKET.symbol} Perpetual Market`);
    
    // Equal reserves (the critical fix)
    const ammInitialQuoteAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const ammInitialBaseAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const periodicity = new BN(3600); // 1 hour
    const pegMultiplier = PEG_PRECISION.mul(new BN(ABC_MARKET.startPrice)); // $1000 peg
    
    console.log(`Configuration:`);
    console.log(`  Equal reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    console.log(`  Oracle source: PRELAUNCH`);
    console.log(`  Peg multiplier: ${pegMultiplier.toString()} ($${ABC_MARKET.startPrice})`);
    
    try {
      const marketTxSig = await driftClient.initializePerpMarket(
        ABC_MARKET.marketIndex,
        prelaunchOracle,           // Our prelaunch oracle
        ammInitialBaseAssetAmount,
        ammInitialQuoteAssetAmount,
        periodicity,
        pegMultiplier,
        OracleSource.Prelaunch     // Critical: Use prelaunch oracle source
      );

      console.log(`✅ ${ABC_MARKET.symbol} MARKET CREATED!`);
      console.log(`   TX: ${marketTxSig}`);
      console.log(`   🔗 View: https://solscan.io/tx/${marketTxSig}?cluster=devnet`);
      
      // Step 4: Verify Market Creation
      console.log(`\n🔍 Step 3: Verifying Market Creation`);
      
      await driftClient.fetchAccounts();
      const perpMarket = driftClient.getPerpMarketAccount(ABC_MARKET.marketIndex);
      
      if (perpMarket && perpMarket.amm) {
        console.log(`✅ Market Verification Successful:`);
        console.log(`   Market Index: ${ABC_MARKET.marketIndex}`);
        console.log(`   Oracle: ${perpMarket.amm.oracle.toBase58()}`);
        console.log(`   Oracle Source: ${JSON.stringify(perpMarket.amm.oracleSource)}`);
        console.log(`   Equal Reserves: ${perpMarket.amm.baseAssetReserve.eq(perpMarket.amm.quoteAssetReserve)}`);
        console.log(`   Base Reserve: ${perpMarket.amm.baseAssetReserve.toString()}`);
        console.log(`   Quote Reserve: ${perpMarket.amm.quoteAssetReserve.toString()}`);
        console.log(`   Peg Multiplier: ${perpMarket.amm.pegMultiplier.toString()}`);
        
        console.log(`\n🎉 SUCCESS! ABC MARKET IS FULLY OPERATIONAL!`);
        console.log(`🎯 Market Details:`);
        console.log(`   • Symbol: ${ABC_MARKET.symbol}`);
        console.log(`   • Starting Price: $${ABC_MARKET.startPrice}`);
        console.log(`   • Max Price: $${ABC_MARKET.maxPrice}`);
        console.log(`   • Oracle Type: Prelaunch`);
        console.log(`   • Price Discovery: Will activate with first trades`);
        console.log(`\n🚀 Your ABC perpetual futures market is ready for trading!`);
        
      } else {
        console.log(`❌ Market verification failed - could not load market data`);
      }

    } catch (marketError) {
      console.log(`❌ Market creation failed: ${marketError.message}`);
      
      if (marketError.message.includes('already initialized') || 
          marketError.message.includes('already exists')) {
        console.log(`✅ ${ABC_MARKET.symbol} market already exists!`);
        
        try {
          const perpMarket = driftClient.getPerpMarketAccount(ABC_MARKET.marketIndex);
          if (perpMarket) {
            console.log(`✅ Existing market verified - Oracle: ${perpMarket.amm.oracle.toBase58()}`);
            console.log(`🎉 ABC MARKET IS READY!`);
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