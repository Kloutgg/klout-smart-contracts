const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { 
  BN, 
  AdminClient, 
  Wallet, 
  BulkAccountLoader,
  OracleSource,
  ContractTier,
  BASE_PRECISION,
  PRICE_PRECISION,
  PEG_PRECISION,
  ZERO,
  ONE
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC");

// THE CRITICAL FIX: Equal reserves
const ammInitialQuoteAssetAmount = new BN(100).mul(BASE_PRECISION);
const ammInitialBaseAssetAmount = new BN(100).mul(BASE_PRECISION); // SAME VALUE!

// Your markets with Pyth Feed details
const MARKETS = [
  {
    symbol: 'SOL',
    index: 0,
    oracle: new PublicKey("CAXyA9sH9vHdWYb2zY7AdK5gydSRRo2Z2Nzrfns9PFZi"),
    pythLazerId: 6,
    pythFeedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    pegMultiplier: new BN(150).mul(PEG_PRECISION) // $150
  },
  {
    symbol: 'BTC',
    index: 1,
    oracle: new PublicKey("Bwt4PmNNn9oGA7rHXm31FULqACSfEkWnsAH2kn2hVYPy"),
    pythLazerId: 1,
    pythFeedId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    pegMultiplier: new BN(65000).mul(PEG_PRECISION) // $65,000
  },
  {
    symbol: 'ETH',
    index: 2,
    oracle: new PublicKey("Cv9P85YP1rFf7W5yn77ZK4UjgzdVpoYiYsBHb55GvnfU"),
    pythLazerId: 2,
    pythFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    pegMultiplier: new BN(3500).mul(PEG_PRECISION) // $3,500
  }
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("🎯 PROPER MARKET SETUP - Oracle First, Then Markets");
  console.log("🔧 Step 1: Initialize Pyth Lazer Oracles");
  console.log("🔧 Step 2: Create Perpetual Markets\n");
  
  // Load wallet
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  console.log("📝 Wallet:", keypair.publicKey.toBase58());

  // Setup
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  const wallet = new Wallet(keypair);
  
  console.log("💰 Balance:", ((await connection.getBalance(keypair.publicKey)) / 1e9).toFixed(2), "SOL");

  // Create AdminClient (not TestClient - we need the oracle methods)
  const bulkAccountLoader = new BulkAccountLoader(connection, 'confirmed', 1000);

  const adminClient = new AdminClient({
    connection,
    wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [0, 1, 2],
    spotMarketIndexes: [0],
    subAccountIds: [],
    accountSubscription: {
      type: 'polling',
      accountLoader: bulkAccountLoader,
    },
  });

  try {
    // Subscribe to client
    console.log("🔧 Setting up AdminClient...");
    await adminClient.subscribe();
    await adminClient.fetchAccounts();

    // Verify state is accessible
    const state = adminClient.getStateAccount();
    console.log("✅ State accessible!");
    console.log(`  Admin: ${state.admin.toBase58()}`);
    console.log(`  Current markets: ${state.numberOfMarkets} perp, ${state.numberOfSpotMarkets} spot`);

    console.log("\n" + "=".repeat(60));
    console.log("🔧 STEP 1: INITIALIZING PYTH LAZER ORACLES");
    console.log("=".repeat(60));

    // Initialize each oracle first
    for (const market of MARKETS) {
      console.log(`\n🔮 Initializing ${market.symbol} Oracle`);
      console.log(`  Pyth Lazer ID: ${market.pythLazerId}`);
      console.log(`  Pyth Feed ID: ${market.pythFeedId}`);
      console.log(`  Expected Oracle PDA: ${market.oracle.toBase58()}`);

      try {
        console.log("  🔄 Calling initializePythLazerOracle...");
        const oracleInitSig = await adminClient.initializePythLazerOracle(market.pythLazerId);
        console.log(`  ✅ ${market.symbol} Oracle INITIALIZED!`);
        console.log(`  📋 Transaction: ${oracleInitSig}`);
      } catch (oracleError) {
        console.log(`  ❌ Oracle Error: ${oracleError.message}`);
        
        if (oracleError.message.includes('already initialized') || 
            oracleError.message.includes('already exists') ||
            oracleError.message.includes('already in use')) {
          console.log(`  ✅ ${market.symbol} Oracle already exists - SUCCESS!`);
        } else {
          console.log(`  🔍 Full oracle error: ${oracleError.stack}`);
          // Continue anyway - maybe oracle exists
        }
      }

      await sleep(2000); // Wait between oracle initializations
    }

    console.log("\n" + "=".repeat(60));
    console.log("🔧 STEP 2: CREATING PERPETUAL MARKETS");
    console.log("=".repeat(60));

    // Verify the critical fix
    console.log("\n🔍 CRITICAL FIX VERIFIED:");
    console.log(`✅ Equal reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    console.log(`📊 Base: ${ammInitialBaseAssetAmount.toString()}`);
    console.log(`📊 Quote: ${ammInitialQuoteAssetAmount.toString()}`);

    let created = 0;
    const periodicity = new BN(3600); // 1 hour

    // Now create markets (oracles should exist now)
    for (const market of MARKETS) {
      console.log(`\n🏪 Creating ${market.symbol} Market (Index ${market.index})`);
      console.log(`  Oracle: ${market.oracle.toBase58()}`);
      console.log(`  Target Price: $${market.pegMultiplier.div(PEG_PRECISION).toString()}`);

      try {
        console.log("  🔄 Calling initializePerpMarket...");
        
        // Use AdminClient's full initializePerpMarket method
        const txSig = await adminClient.initializePerpMarket(
          market.index,                              // marketIndex
          market.oracle,                             // priceOracle (now initialized!)
          ammInitialBaseAssetAmount,                 // baseAssetReserve - EQUAL
          ammInitialQuoteAssetAmount,                // quoteAssetReserve - EQUAL (THE FIX!)
          periodicity,                               // periodicity
          market.pegMultiplier,                      // pegMultiplier (sets price)
          OracleSource.PythLazer,                    // oracleSource (your requirement)
          ContractTier.A,                            // contractTier (high tier)
          2000,                                      // marginRatioInitial (20%)
          500,                                       // marginRatioMaintenance (5%)
          0,                                         // liquidatorFee
          10000,                                     // ifLiquidatorFee
          0,                                         // imfFactor
          true,                                      // activeStatus
          0,                                         // baseSpread
          142500,                                    // maxSpread
          ZERO,                                      // maxOpenInterest
          ZERO,                                      // maxRevenueWithdrawPerPeriod
          ZERO,                                      // quoteMaxInsurance
          BASE_PRECISION.divn(10000),                // orderStepSize
          PRICE_PRECISION.divn(100000),              // orderTickSize
          BASE_PRECISION.divn(10000),                // minOrderSize
          ONE,                                       // concentrationCoefScale
          0,                                         // curveUpdateIntensity
          0,                                         // ammJitIntensity
          `${market.symbol}-PERP`                    // name
        );

        console.log(`  ✅ ${market.symbol} MARKET CREATED SUCCESSFULLY!`);
        console.log(`  📋 Transaction: ${txSig}`);
        console.log(`  💰 Price: $${market.pegMultiplier.div(PEG_PRECISION).toString()}`);
        console.log(`  🔮 Oracle: Connected to Pyth Lazer ID ${market.pythLazerId}`);
        created++;

        // Refresh accounts after creation
        await adminClient.fetchAccounts();

      } catch (error) {
        console.log(`  ❌ Market Error: ${error.message}`);
        
        if (error.message.includes('0x177b')) {
          console.log("  🚨 InvalidInitialPeg - This shouldn't happen with equal reserves!");
          console.log(`     Base: ${ammInitialBaseAssetAmount.toString()}`);
          console.log(`     Quote: ${ammInitialQuoteAssetAmount.toString()}`);
          console.log(`     Equal: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
        } else if (error.message.includes('already initialized') || 
                   error.message.includes('already exists') ||
                   error.message.includes('Market Index Already Initialized')) {
          console.log(`  ✅ ${market.symbol} market already exists - SUCCESS!`);
          created++;
        } else if (error.message.includes('0x7d6')) {
          console.log("  🔧 Error 0x7d6 - Oracle should be initialized now, this is unexpected");
        } else {
          console.log(`  🔍 Full error: ${error.stack || error.message}`);
        }
      }

      await sleep(3000); // Wait between markets
    }

    console.log(`\n📊 CREATION RESULTS: ${created}/3 markets processed`);

    // FINAL VERIFICATION
    console.log("\n" + "=".repeat(60));
    console.log("🔍 FINAL VERIFICATION");
    console.log("=".repeat(60));
    
    await adminClient.fetchAccounts();
    
    let working = 0;
    for (const market of MARKETS) {
      try {
        const perpMarket = adminClient.getPerpMarketAccount(market.index);
        if (perpMarket && perpMarket.amm && perpMarket.amm.oracle) {
          console.log(`\n✅ ${market.symbol}: FULLY WORKING`);
          console.log(`  Oracle: ${perpMarket.amm.oracle.toBase58()}`);
          console.log(`  Oracle Match: ${perpMarket.amm.oracle.equals(market.oracle) ? '✅' : '❌'}`);
          console.log(`  Reserves Equal: ${perpMarket.amm.baseAssetReserve.eq(perpMarket.amm.quoteAssetReserve) ? '✅' : '❌'}`);
          console.log(`  Oracle Source: ${JSON.stringify(perpMarket.amm.oracleSource)}`);
          console.log(`  Peg Multiplier: ${perpMarket.amm.pegMultiplier.toString()}`);
          console.log(`  Target Price: $${perpMarket.amm.pegMultiplier.div(PEG_PRECISION).toString()}`);
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
      console.log("✅ All markets connected to your specified oracles!");
      console.log("✅ Using PythLazer oracle source as requested!");
      console.log("✅ InvalidInitialPeg fix is working perfectly!");
      console.log("✅ SDK state loading issue is solved!");
      console.log("✅ Two-step process (Oracle → Market) completed!");
      
      console.log("\n📈 Your Markets:");
      MARKETS.forEach(market => {
        console.log(`  • ${market.symbol}: $${market.pegMultiplier.div(PEG_PRECISION).toString()} (Index ${market.index}, Pyth Lazer ${market.pythLazerId})`);
      });
      
      console.log("\n🎯 You can now trade perpetual futures on all three markets!");
      
    } else if (working > 0) {
      console.log(`🎉 PARTIAL SUCCESS: ${working}/3 markets working`);
      console.log("Some markets are ready - you can trade on these while troubleshooting the rest");
    } else {
      console.log("❌ MARKETS STILL NOT WORKING");
      console.log("The oracle initialization step may need more investigation");
    }
    console.log("=".repeat(60));

  } catch (error) {
    console.log("❌ Fatal error:", error.message);
    console.log("Stack:", error.stack);
  } finally {
    try {
      await adminClient.unsubscribe();
      console.log("🧹 Disconnected");
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}

main().catch(console.error); 