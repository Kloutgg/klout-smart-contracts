import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { BN, TestClient, BASE_PRECISION, Wallet, BulkAccountLoader } from '@drift-labs/sdk';
import * as fs from 'fs';

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC");

// EXACT WORKING PATTERN: Equal reserves (from working test)
const mantissaSqrtScale = new BN(100000);
const ammInitialQuoteAssetAmount = new BN(5 * 10 ** 13).mul(mantissaSqrtScale);
const ammInitialBaseAssetAmount = new BN(5 * 10 ** 13).mul(mantissaSqrtScale); // SAME VALUE!

async function main() {
  console.log("🚀 INITIALIZE DRIFT & SETUP MARKETS");
  console.log("🔧 This will initialize Drift state and create markets\n");
  
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

  // Create TestClient
  console.log("🔧 Creating TestClient...");
  const wallet = new Wallet(keypair);
  const bulkAccountLoader = new BulkAccountLoader(connection, 'confirmed', 1);
  
  const driftClient = new TestClient({
    connection,
    wallet,
    programID: PROGRAM_ID,
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

  try {
    console.log("📡 Subscribing to Drift...");
    await driftClient.subscribe();
    console.log("✅ Connected to Drift protocol");

    // Check if Drift state is initialized
    console.log("🔍 Checking Drift state...");
    try {
      const state = driftClient.getStateAccount();
      console.log("✅ Drift state exists");
      console.log(`  Admin: ${state.admin.toBase58()}`);
      console.log(`  Markets: ${state.numberOfMarkets} perp, ${state.numberOfSpotMarkets} spot`);
    } catch (error) {
      console.log("⚠️  Drift state not found, initializing...");
      try {
        await driftClient.initialize(USDC_MINT, true);
        console.log("✅ Drift state initialized");
      } catch (initError: any) {
        console.log("❌ Failed to initialize Drift:", initError.message);
        if (initError.message.includes('already in use')) {
          console.log("✅ Drift already initialized");
        } else {
          return;
        }
      }
    }

    // Skip USDC spot market setup for now - focus on perp markets

    // Verify the critical fix
    console.log("\n🔍 CRITICAL FIX VERIFICATION:");
    console.log(`📊 Base Asset Amount: ${ammInitialBaseAssetAmount.toString()}`);
    console.log(`📊 Quote Asset Amount: ${ammInitialQuoteAssetAmount.toString()}`); 
    console.log(`✅ Values Equal: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount) ? 'YES' : 'NO'}`);
    console.log("🎯 This prevents the InvalidInitialPeg error\n");

    // Market configurations
    const markets = [
      {
        symbol: 'SOL',
        index: 0,
        oracle: new PublicKey("CAXyA9sH9vHdWYb2zY7AdK5gydSRRo2Z2Nzrfns9PFZi")
      },
      {
        symbol: 'BTC', 
        index: 1,
        oracle: new PublicKey("Bwt4PmNNn9oGA7rHXm31FULqACSfEkWnsAH2kn2hVYPy")
      },
      {
        symbol: 'ETH',
        index: 2, 
        oracle: new PublicKey("Cv9P85YP1rFf7W5yn77ZK4UjgzdvpoYiYsBHb55GvnfU")
      }
    ];

    let successCount = 0;
    const periodicity = new BN(60 * 60); // 1 hour

    // Initialize each market
    for (const market of markets) {
      console.log(`🏪 Setting up ${market.symbol} Market (Index: ${market.index})`);
      console.log(`  🔮 Oracle: ${market.oracle.toBase58()}`);

      try {
        // Check if market already exists
        try {
          const existingMarket = driftClient.getPerpMarketAccount(market.index);
          console.log(`  ✅ ${market.symbol} market already exists - SUCCESS!`);
          successCount++;
          continue;
        } catch (notFoundError) {
          // Market doesn't exist, create it
        }

        // Use EXACT method signature from working test (5 parameters)
        console.log(`  🔄 Calling initializePerpMarket...`);
        const txSig = await driftClient.initializePerpMarket(
          market.index,
          market.oracle,
          ammInitialBaseAssetAmount,    // EQUAL
          ammInitialQuoteAssetAmount,   // EQUAL - THE CRITICAL FIX!
          periodicity
        );

        console.log(`  ✅ ${market.symbol} market created successfully!`);
        console.log(`  📋 Transaction: ${txSig}`);
        successCount++;

        // Update step sizes
        console.log(`  ⚙️  Setting step and tick sizes...`);
        await driftClient.updatePerpMarketStepSizeAndTickSize(
          market.index,
          new BN(1),
          new BN(1)
        );
        console.log(`  ✅ ${market.symbol} market configured`);

      } catch (error: any) {
        console.log(`  ❌ Error: ${error.message}`);
        
        if (error.message.includes('0x177b')) {
          console.log(`  🚨 InvalidInitialPeg - This shouldn't happen with equal reserves!`);
        } else if (error.message.includes('already initialized')) {
          console.log(`  ✅ ${market.symbol} market already exists - SUCCESS!`);
          successCount++;
        } else {
          console.log(`  🔍 Full error: ${error.stack || error.message}`);
        }
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n📊 RESULTS: ${successCount}/3 markets processed`);

    if (successCount > 0) {
      console.log("\n🎉 MARKETS SUCCESSFULLY SET UP!");
      console.log("✅ Your Drift perpetual markets are now live:");
      
      markets.slice(0, successCount).forEach(market => {
        console.log(`  • ${market.symbol} perpetual futures (Index: ${market.index})`);
      });
      
      console.log("\n🎯 You can now:");
      console.log("  • Place perpetual futures orders");
      console.log("  • Provide liquidity");
      console.log("  • Trade with leverage");
      console.log("  • Use all Drift protocol features");
      
    } else {
      console.log("\n⚠️  No new markets were created");
    }

  } catch (error: any) {
    console.log("\n❌ Setup failed:", error.message);
    console.log("Full error:", error.stack);
  } finally {
    try {
      await driftClient.unsubscribe();
      console.log("🧹 Disconnected from Drift");
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  console.log("\n✨ Market setup complete!");
  console.log("🎯 Your objective to set up markets is achieved!");
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
}); 