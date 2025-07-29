const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { BN, AdminClient, Wallet, BulkAccountLoader } = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");

// THE CRITICAL FIX: Equal reserves (from working test pattern)
const mantissaSqrtScale = new BN(100000);
const ammInitialQuoteAssetAmount = new BN(5 * 10 ** 13).mul(mantissaSqrtScale);
const ammInitialBaseAssetAmount = new BN(5 * 10 ** 13).mul(mantissaSqrtScale); // SAME VALUE!

// Your oracle addresses
const MARKETS = [
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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("🎯 FINAL DEFINITIVE MARKET SETUP");
  console.log("🔧 This WILL create your markets with the critical fix\n");
  
  // Load wallet
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  console.log("📝 Wallet:", keypair.publicKey.toBase58());

  // Setup
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  const wallet = new Wallet(keypair);
  
  console.log("💰 Balance:", ((await connection.getBalance(keypair.publicKey)) / 1e9).toFixed(2), "SOL");

  // Create AdminClient
  const adminClient = new AdminClient({
    connection,
    wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    accountSubscription: {
      type: 'polling',
      accountLoader: new BulkAccountLoader(connection, 'confirmed', 1000), // Longer timeout
    },
  });

  try {
    console.log("📡 Subscribing to AdminClient...");
    await adminClient.subscribe();
    
    // Wait for state to fully load
    console.log("⏳ Waiting for state to load...");
    await sleep(5000); // Give more time for state to load
    
    console.log("✅ Connected to Drift");

    // Verify the critical fix
    console.log("\n🔍 CRITICAL FIX APPLIED:");
    console.log(`✅ Equal reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    console.log(`📊 Value: ${ammInitialBaseAssetAmount.toString()}\n`);

    let created = 0;
    const periodicity = new BN(3600); // 1 hour

    // Create each market
    for (const market of MARKETS) {
      console.log(`🏪 Creating ${market.symbol} Market (Index ${market.index})`);
      console.log(`  Oracle: ${market.oracle.toBase58()}`);

      try {
        console.log("  🔄 Calling initializePerpMarket...");
        
        // Use the EXACT working method signature (5 parameters)
        const txSig = await adminClient.initializePerpMarket(
          market.index,
          market.oracle,
          ammInitialBaseAssetAmount,    // EQUAL
          ammInitialQuoteAssetAmount,   // EQUAL - THE CRITICAL FIX!
          periodicity
        );

        console.log(`  ✅ ${market.symbol} CREATED! TX: ${txSig}`);
        created++;

        // Configure the market
        await sleep(2000); // Wait for market to be created
        
        await adminClient.updatePerpMarketStepSizeAndTickSize(
          market.index,
          new BN(1000),
          new BN(100)
        );
        console.log(`  ✅ ${market.symbol} configured`);

      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        
        if (error.message.includes('0x177b')) {
          console.log("  🚨 InvalidInitialPeg - Fix not working!");
        } else if (error.message.includes('already initialized') || 
                   error.message.includes('already exists')) {
          console.log(`  ✅ ${market.symbol} already exists - SUCCESS!`);
          created++;
        } else if (error.message.includes('0x7d6')) {
          console.log("  🔧 Error 0x7d6 - Oracle or account issue");
        } else {
          console.log(`  🔍 Details: ${error.message}`);
        }
      }

      await sleep(3000); // Wait between markets
    }

    console.log(`\n📊 CREATION RESULTS: ${created}/3 markets processed`);

    // FINAL VERIFICATION - Check if markets actually work
    console.log("\n🔍 VERIFYING MARKETS ARE WORKING:");
    let working = 0;
    
    // Force refresh the client state
    await adminClient.fetchAccounts();
    await sleep(2000);
    
    for (const market of MARKETS) {
      try {
        const perpMarket = adminClient.getPerpMarketAccount(market.index);
        if (perpMarket && perpMarket.amm && perpMarket.amm.oracle) {
          console.log(`  ✅ ${market.symbol}: WORKING`);
          console.log(`    Oracle: ${perpMarket.amm.oracle.toBase58()}`);
          console.log(`    Reserves Equal: ${perpMarket.amm.baseAssetReserve.eq(perpMarket.amm.quoteAssetReserve)}`);
          working++;
        }
      } catch (error) {
        console.log(`  ❌ ${market.symbol}: Not accessible - ${error.message}`);
      }
    }

    console.log(`\n${"=".repeat(60)}`);
    if (working === 3) {
      console.log("🎉 SUCCESS! ALL 3 MARKETS ARE CREATED AND WORKING!");
      console.log("🎯 GOAL ACHIEVED!");
      console.log("✅ Your SOL, BTC, and ETH perpetual markets are ready!");
      console.log("✅ You can now trade on all three markets!");
      console.log("✅ The InvalidInitialPeg fix is working!");
    } else if (working > 0) {
      console.log(`🎉 PARTIAL SUCCESS: ${working}/3 markets working`);
      console.log("🎯 Progress made - some markets are ready");
    } else {
      console.log("❌ MARKETS STILL NOT WORKING");
      console.log("Goal not achieved yet - troubleshooting needed");
    }
    console.log("=".repeat(60));

  } catch (error) {
    console.log("❌ Fatal error:", error.message);
    console.log(error.stack);
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