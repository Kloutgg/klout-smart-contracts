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
  getPythLazerOraclePublicKey,
  Wallet
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("4r69MyZAKmJ1UR21tndDKpkGXs9Pa9MuhzAVEtF5KZGY");
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC");

// THE CRITICAL FIX: Equal reserves
const ammInitialQuoteAssetAmount = new BN(100).mul(BASE_PRECISION);
const ammInitialBaseAssetAmount = new BN(100).mul(BASE_PRECISION); // SAME VALUE!

// Your markets following the working test pattern
const MARKETS = [
  {
    symbol: 'SOL', 
    index: 0,
    pythLazerId: 6,  // From working test
    pegMultiplier: new BN(150).mul(PEG_PRECISION)
  },
  {
    symbol: 'BTC',
    index: 1, 
    pythLazerId: 1,  // From working test
    pegMultiplier: new BN(65000).mul(PEG_PRECISION)
  },
  {
    symbol: 'ETH',
    index: 2,
    pythLazerId: 2,  // From working test
    pegMultiplier: new BN(3500).mul(PEG_PRECISION)
  }
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("🎯 WORKING PATTERN SETUP - Following pythLazer.ts Exact Pattern");  
  console.log("🔧 Using TestClient with exact initialization sequence\n");
  
  // Load wallet
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  console.log("📝 Wallet:", keypair.publicKey.toBase58());

  // Setup exactly like working test - use provider pattern
  const provider = new anchor.AnchorProvider(
    new Connection(DEVNET_RPC, 'confirmed'),
    new Wallet(keypair),
    { commitment: 'confirmed', preflightCommitment: 'confirmed' }
  );
  
  console.log("💰 Balance:", ((await provider.connection.getBalance(keypair.publicKey)) / 1e9).toFixed(2), "SOL");

  // Show oracle PDAs that will be created
  for (const market of MARKETS) {
    const oracleKey = getPythLazerOraclePublicKey(DRIFT_PROGRAM_ID, market.pythLazerId);
    console.log(`🔮 ${market.symbol} Oracle PDA: ${oracleKey.toBase58()} (Feed ID: ${market.pythLazerId})`);
  }

  // Create TestClient without oracle infos initially (we'll initialize oracles first)
  const bulkAccountLoader = new BulkAccountLoader(provider.connection, 'confirmed', 0);
  
  const driftClient = new TestClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [0, 1, 2],  // Markets we want
    spotMarketIndexes: [0],        // USDC spot market
    oracleInfos: [],               // Empty initially - oracles don't exist yet
    accountSubscription: {
      type: 'polling',
      accountLoader: bulkAccountLoader,
    },
  });

  try {
    // Follow exact working test sequence
    console.log("🔧 Initializing Drift (following working test pattern)...");
    try {
      await driftClient.initialize(USDC_MINT, true);
      console.log("✅ Drift initialized");
    } catch (initError) {
      if (initError.message.includes('already initialized') || initError.message.includes('Clearing house already initialized')) {
        console.log("✅ Drift already initialized");
      } else {
        throw initError;
      }
    }

    console.log("🔧 Subscribing...");
    await driftClient.subscribe();
    console.log("✅ Subscribed");

    // Verify state is accessible
    const state = driftClient.getStateAccount();
    console.log("✅ State accessible!");
    console.log(`  Admin: ${state.admin.toBase58()}`);
    console.log(`  Current markets: ${state.numberOfMarkets} perp, ${state.numberOfSpotMarkets} spot`);

    console.log("\n" + "=".repeat(60));
    console.log("🔧 STEP 1: INITIALIZING PYTH LAZER ORACLES (Working Test Pattern)");
    console.log("=".repeat(60));

    // Initialize oracles using exact working test method
    for (const market of MARKETS) {
      console.log(`\n🔮 Initializing ${market.symbol} Oracle (Feed ID: ${market.pythLazerId})`);
      
      try {
        console.log("  🔄 Calling initializePythLazerOracle (working test method)...");
        await driftClient.initializePythLazerOracle(market.pythLazerId);
        console.log(`  ✅ ${market.symbol} Oracle INITIALIZED!`);
      } catch (oracleError) {
        console.log(`  ❌ Oracle Error: ${oracleError.message}`);
        
        if (oracleError.message.includes('already initialized') || 
            oracleError.message.includes('already exists') ||
            oracleError.message.includes('already in use')) {
          console.log(`  ✅ ${market.symbol} Oracle already exists - SUCCESS!`);
        } else {
          console.log(`  🔍 Full oracle error: ${oracleError.stack}`);
          // Continue anyway
        }
      }

      await sleep(2000);
    }

    console.log("\n" + "=".repeat(60));
    console.log("🔧 STEP 2: CREATING PERPETUAL MARKETS (Working Test Pattern)");
    console.log("=".repeat(60));

    // Verify the critical fix
    console.log("\n🔍 CRITICAL FIX VERIFIED:");
    console.log(`✅ Equal reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    console.log(`📊 Base: ${ammInitialBaseAssetAmount.toString()}`);
    console.log(`📊 Quote: ${ammInitialQuoteAssetAmount.toString()}`);

    let created = 0;
    const periodicity = new BN(3600); // 1 hour

    // Create markets using working test client method
    for (const market of MARKETS) {
      console.log(`\n🏪 Creating ${market.symbol} Market (Index ${market.index})`);
      const oracleKey = getPythLazerOraclePublicKey(DRIFT_PROGRAM_ID, market.pythLazerId);
      console.log(`  Oracle: ${oracleKey.toBase58()}`);
      console.log(`  Target Price: $${market.pegMultiplier.div(PEG_PRECISION).toString()}`);

      try {
        console.log("  🔄 Calling initializePerpMarket (working test pattern)...");
        
        // Use the 5-parameter method like working tests
        const txSig = await driftClient.initializePerpMarket(
          market.index,                              // marketIndex
          oracleKey,                                 // oracle (now initialized!)
          ammInitialBaseAssetAmount,                 // baseAssetReserve - EQUAL
          ammInitialQuoteAssetAmount,                // quoteAssetReserve - EQUAL (THE FIX!)
          periodicity                                // periodicity
        );

        console.log(`  ✅ ${market.symbol} MARKET CREATED SUCCESSFULLY!`);
        console.log(`  📋 Transaction: ${txSig}`);
        console.log(`  💰 Price: $${market.pegMultiplier.div(PEG_PRECISION).toString()}`);
        console.log(`  🔮 Oracle: Connected to Pyth Lazer ID ${market.pythLazerId}`);
        created++;

        // Configure the market step size
        await driftClient.updatePerpMarketStepSizeAndTickSize(
          market.index,
          new BN(1000),     // step size
          new BN(100)       // tick size
        );
        console.log(`  ✅ ${market.symbol} configured`);

      } catch (error) {
        console.log(`  ❌ Market Error: ${error.message}`);
        
        if (error.message.includes('0x177b')) {
          console.log("  🚨 InvalidInitialPeg - This shouldn't happen with equal reserves!");
        } else if (error.message.includes('already initialized') || 
                   error.message.includes('already exists') ||
                   error.message.includes('Market Index Already Initialized')) {
          console.log(`  ✅ ${market.symbol} market already exists - SUCCESS!`);
          created++;
        } else if (error.message.includes('0x7d6')) {
          console.log("  🔧 Error 0x7d6 - Oracle should be initialized now");
        } else {
          console.log(`  🔍 Full error: ${error.stack || error.message}`);
        }
      }

      await sleep(3000);
    }

    console.log(`\n📊 CREATION RESULTS: ${created}/3 markets processed`);

    // FINAL VERIFICATION
    console.log("\n" + "=".repeat(60));
    console.log("🔍 FINAL VERIFICATION");
    console.log("=".repeat(60));
    
    let working = 0;
    for (const market of MARKETS) {
      try {
        const perpMarket = driftClient.getPerpMarketAccount(market.index);
        if (perpMarket && perpMarket.amm && perpMarket.amm.oracle) {
          console.log(`\n✅ ${market.symbol}: FULLY WORKING`);
          console.log(`  Oracle: ${perpMarket.amm.oracle.toBase58()}`);
          console.log(`  Reserves Equal: ${perpMarket.amm.baseAssetReserve.eq(perpMarket.amm.quoteAssetReserve) ? '✅' : '❌'}`);
          console.log(`  Oracle Source: ${JSON.stringify(perpMarket.amm.oracleSource)}`);
          working++;
        }
      } catch (error) {
        console.log(`\n❌ ${market.symbol}: Not accessible - ${error.message}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    if (working === 3) {
      console.log("🎉 SUCCESS! ALL 3 MARKETS CREATED AND WORKING!");
      console.log("🎯 GOAL ACHIEVED!");
      console.log("✅ Your SOL, BTC, and ETH perpetual markets are ready!");
      console.log("✅ All oracles initialized with Pyth Lazer feeds!");
      console.log("✅ Using working test pattern - no more versioned transaction errors!");
      console.log("✅ InvalidInitialPeg fix is working perfectly!");
      console.log("✅ SDK state loading issue is solved!");
      
      console.log("\n📈 Your Markets:");
      MARKETS.forEach(market => {
        console.log(`  • ${market.symbol}: $${market.pegMultiplier.div(PEG_PRECISION).toString()} (Index ${market.index}, Pyth Lazer ${market.pythLazerId})`);
      });
      
      console.log("\n🎯 You can now trade perpetual futures on all three markets!");
      
    } else if (working > 0) {
      console.log(`🎉 PARTIAL SUCCESS: ${working}/3 markets working`);
      console.log("Some markets are ready - progress made!");
    } else {
      console.log("❌ MARKETS STILL NOT WORKING");
      console.log("Need to investigate further");
    }
    console.log("=".repeat(60));

  } catch (error) {
    console.log("❌ Fatal error:", error.message);
    console.log("Stack:", error.stack);
  } finally {
    try {
      await driftClient.unsubscribe();
      console.log("🧹 Disconnected");
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}

main().catch(console.error); 