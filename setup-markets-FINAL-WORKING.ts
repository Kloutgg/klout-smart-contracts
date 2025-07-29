import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { BN, TestClient, BASE_PRECISION, Wallet, BulkAccountLoader } from '@drift-labs/sdk';
import * as fs from 'fs';

// User's specific configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC");
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");
const PYTH_PROGRAM_ID = new PublicKey("EXWUmJmFfLaGD6ookJfRKNCpuVDqaSEvWTwU2fpn4eyr");
const TOKEN_FAUCET_PROGRAM_ID = new PublicKey("5mnk7fV1JRfsr2jqVCb8yrw4mKByEQcJkGXRUXguc1TE");

// CRITICAL FIX: Equal reserves
const mantissaSqrtScale = new BN(100000);
const ammInitialQuoteAssetAmount = new BN(5 * 10 ** 13).mul(mantissaSqrtScale);
const ammInitialBaseAssetAmount = new BN(5 * 10 ** 13).mul(mantissaSqrtScale); // SAME VALUE!

// User's specific oracle configuration
const MARKETS = [
  {
    symbol: 'SOL',
    index: 0,
    oracle: new PublicKey("CAXyA9sH9vHdWYb2zY7AdK5gydSRRo2Z2Nzrfns9PFZi"),
    pythLazerId: 6,
    pythFeedId: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d"
  },
  {
    symbol: 'BTC',
    index: 1,
    oracle: new PublicKey("Bwt4PmNNn9oGA7rHXm31FULqACSfEkWnsAH2kn2hVYPy"),
    pythLazerId: 1,
    pythFeedId: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
  },
  {
    symbol: 'ETH',
    index: 2,
    oracle: new PublicKey("Cv9P85YP1rFf7W5yn77ZK4UjgzdvpoYiYsBHb55GvnfU"),
    pythLazerId: 2,
    pythFeedId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"
  }
];

async function main() {
  console.log("🎯 FINAL MARKET SETUP - ACTUALLY CREATING THE MARKETS");
  console.log("🔧 This will create SOL, BTC, and ETH perpetual markets\n");
  
  // Load wallet
  let keypair: Keypair;
  try {
    const secretKey = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'));
    keypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
    console.log("📝 Wallet loaded:", keypair.publicKey.toBase58());
  } catch (error) {
    console.error("❌ Failed to load wallet:", error);
    return;
  }

  // Create connection
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  console.log("🔗 Connected to devnet");

  // Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  console.log("💰 Balance:", (balance / 1e9).toFixed(2), "SOL");

  if (balance < 5e9) {
    console.log("⚠️  You might need more SOL for transactions");
  }

  // Create TestClient
  console.log("🔧 Creating TestClient...");
  const wallet = new Wallet(keypair);
  const bulkAccountLoader = new BulkAccountLoader(connection, 'confirmed', 1);
  
  const driftClient = new TestClient({
    connection,
    wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    },
    activeSubAccountId: 0,
    perpMarketIndexes: [0, 1, 2],
    spotMarketIndexes: [0],
    subAccountIds: [],
    accountSubscription: {
      type: 'polling',
      accountLoader: bulkAccountLoader,
    },
  });

  let successCount = 0; // Declare outside try block for access in final status
  
  try {
    console.log("📡 Subscribing to Drift...");
    await driftClient.subscribe();
    console.log("✅ Connected to Drift protocol");

    // Verify Drift state
    try {
      const state = driftClient.getStateAccount();
      console.log("✅ Drift state initialized");
      console.log(`  Admin: ${state.admin.toBase58()}`);
      console.log(`  Current markets: ${state.numberOfMarkets} perp, ${state.numberOfSpotMarkets} spot`);
    } catch (error) {
      console.log("❌ Drift state not found - this needs to be initialized first");
      console.log("   Try running the Drift initialization script first");
      return;
    }

    // Check current market status
    console.log("\n🔍 Checking current market status...");
    let existingMarkets = 0;
    for (const market of MARKETS) {
      try {
        const perpMarket = driftClient.getPerpMarketAccount(market.index);
        console.log(`  ✅ ${market.symbol} (Index ${market.index}): Already exists`);
        existingMarkets++;
      } catch (error) {
        console.log(`  ❌ ${market.symbol} (Index ${market.index}): Needs to be created`);
      }
    }

    if (existingMarkets === 3) {
      console.log("\n🎉 ALL MARKETS ALREADY EXIST!");
      console.log("✅ Your goal is achieved - markets are set up!");
      return;
    }

    // Show the critical fix
    console.log("\n🔍 CRITICAL FIX APPLIED:");
    console.log(`📊 Base Asset Reserve: ${ammInitialBaseAssetAmount.toString()}`);
    console.log(`📊 Quote Asset Reserve: ${ammInitialQuoteAssetAmount.toString()}`);
    console.log(`✅ Reserves Equal: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount) ? 'YES' : 'NO'}`);
    console.log("🎯 This prevents InvalidInitialPeg (0x177b) error\n");

    const periodicity = new BN(60 * 60); // 1 hour

    // Create each market
    for (const market of MARKETS) {
      console.log(`🏪 Creating ${market.symbol} Market (Index: ${market.index})`);
      console.log(`  🔮 Oracle: ${market.oracle.toBase58()}`);
      console.log(`  📊 Pyth Lazer ID: ${market.pythLazerId}`);
      console.log(`  🆔 Pyth Feed ID: ${market.pythFeedId}`);

      try {
        // Check if already exists
        try {
          const existingMarket = driftClient.getPerpMarketAccount(market.index);
          console.log(`  ✅ ${market.symbol} market already exists - SUCCESS!`);
          successCount++;
          continue;
        } catch (notFound) {
          // Market doesn't exist, create it
        }

        console.log(`  🔄 Creating ${market.symbol} perpetual market...`);
        
        // Use the working method with equal reserves
        const txSig = await driftClient.initializePerpMarket(
          market.index,
          market.oracle,
          ammInitialBaseAssetAmount,    // EQUAL
          ammInitialQuoteAssetAmount,   // EQUAL - THE CRITICAL FIX!
          periodicity
        );

        console.log(`  ✅ ${market.symbol} market CREATED successfully!`);
        console.log(`  📋 Transaction: ${txSig}`);
        successCount++;

        // Configure market parameters
        console.log(`  ⚙️  Configuring market parameters...`);
        await driftClient.updatePerpMarketStepSizeAndTickSize(
          market.index,
          new BN(1000), // Step size
          new BN(100)   // Tick size
        );
        console.log(`  ✅ ${market.symbol} market configured`);

        // Verify the market
        try {
          const createdMarket = driftClient.getPerpMarketAccount(market.index);
          console.log(`  ✅ ${market.symbol} market verified and accessible`);
          console.log(`  📊 Status: ${JSON.stringify(createdMarket.status)}`);
          console.log(`  🔗 Oracle matches: ${createdMarket.amm.oracle.equals(market.oracle) ? '✅' : '❌'}`);
        } catch (verifyError) {
          console.log(`  ⚠️  Market created but verification pending`);
        }

      } catch (error: any) {
        console.log(`  ❌ Error creating ${market.symbol} market: ${error.message}`);
        
        if (error.message.includes('0x177b') || error.message.includes('6011')) {
          console.log(`  🚨 InvalidInitialPeg error - but reserves should be equal!`);
          console.log(`     Base: ${ammInitialBaseAssetAmount.toString()}`);
          console.log(`     Quote: ${ammInitialQuoteAssetAmount.toString()}`);
        } else if (error.message.includes('already initialized') || 
                   error.message.includes('already exists') ||
                   error.message.includes('account already in use')) {
          console.log(`  ✅ ${market.symbol} market already exists - SUCCESS!`);
          successCount++;
        } else if (error.message.includes('0x7d6')) {
          console.log(`  🔧 Error 0x7d6 - checking oracle account...`);
          
          // Check if oracle account exists
          try {
            const oracleAccount = await connection.getAccountInfo(market.oracle);
            if (!oracleAccount) {
              console.log(`     ❌ Oracle account doesn't exist: ${market.oracle.toBase58()}`);
              console.log(`     This oracle needs to be initialized first`);
            } else {
              console.log(`     ✅ Oracle account exists, error may be elsewhere`);
            }
          } catch (oracleError) {
            console.log(`     ❌ Failed to check oracle account`);
          }
        } else {
          console.log(`  🔍 Full error details:`);
          console.log(`     ${error.stack || error.message}`);
        }
      }

      // Wait between markets
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log(`\n📊 FINAL RESULTS: ${successCount}/3 markets processed`);

    if (successCount === 3) {
      console.log("\n🎉 SUCCESS! ALL MARKETS ARE NOW SET UP!");
      console.log("✅ Your perpetual markets are live and ready:");
      
      MARKETS.forEach(market => {
        console.log(`  • ${market.symbol} perpetual futures (Index: ${market.index})`);
        console.log(`    Oracle: ${market.oracle.toBase58()}`);
      });
      
      console.log("\n🎯 GOAL ACHIEVED! You can now:");
      console.log("  • Place perpetual futures orders");
      console.log("  • Provide liquidity");
      console.log("  • Trade with leverage");
      console.log("  • Use all Drift protocol features");
      
    } else if (successCount > 0) {
      console.log(`\n🎉 PARTIAL SUCCESS: ${successCount}/3 markets created`);
      console.log("Some markets are working. You can use these while troubleshooting the rest.");
    } else {
      console.log("\n❌ NO MARKETS WERE SUCCESSFULLY CREATED");
      console.log("The markets are still not set up. Goal not achieved yet.");
      console.log("Need to troubleshoot the specific errors above.");
    }

  } catch (error: any) {
    console.log("\n❌ Setup failed with error:", error.message);
    console.log("Full error:", error.stack);
  } finally {
    try {
      await driftClient.unsubscribe();
      console.log("🧹 Disconnected from Drift");
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("🎯 OBJECTIVE STATUS:");
  if (successCount === 3) {
    console.log("✅ GOAL ACHIEVED - All markets are set up and ready!");
  } else {
    console.log("❌ GOAL NOT YET ACHIEVED - Markets still need to be created");
  }
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
}); 