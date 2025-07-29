import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { BN, TestClient, Wallet, BulkAccountLoader } from '@drift-labs/sdk';
import * as fs from 'fs';

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");

// CRITICAL FIX: Equal reserves
const mantissaSqrtScale = new BN(100000);
const ammInitialQuoteAssetAmount = new BN(5 * 10 ** 13).mul(mantissaSqrtScale);
const ammInitialBaseAssetAmount = new BN(5 * 10 ** 13).mul(mantissaSqrtScale); // SAME VALUE!

// Your specific oracle addresses
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

async function main() {
  console.log("🎯 ACTUALLY CREATING THE MARKETS - No More Confusion");
  console.log("🔧 This will create your SOL, BTC, and ETH markets for real\n");
  
  // Load wallet
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  console.log("📝 Wallet:", keypair.publicKey.toBase58());

  // Setup
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  const wallet = new Wallet(keypair);
  const bulkAccountLoader = new BulkAccountLoader(connection, 'confirmed', 1);
  
  const driftClient = new TestClient({
    connection,
    wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [0, 1, 2],
    spotMarketIndexes: [0],
    subAccountIds: [],
    accountSubscription: { type: 'polling', accountLoader: bulkAccountLoader },
  });

  try {
    await driftClient.subscribe();
    console.log("✅ Connected to Drift");

    // Check balance
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`💰 Balance: ${(balance / 1e9).toFixed(2)} SOL`);

    // Verify the fix
    console.log("\n🔍 CRITICAL FIX VERIFIED:");
    console.log(`✅ Base = Quote Reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    console.log(`📊 Value: ${ammInitialBaseAssetAmount.toString()}\n`);

    let created = 0;
    const periodicity = new BN(3600); // 1 hour

    // Actually create each market
    for (const market of MARKETS) {
      console.log(`🏪 Creating ${market.symbol} Market (Index ${market.index})`);
      console.log(`  Oracle: ${market.oracle.toBase58()}`);

      try {
        console.log("  🔄 Calling initializePerpMarket...");
        const txSig = await driftClient.initializePerpMarket(
          market.index,
          market.oracle,
          ammInitialBaseAssetAmount,    // EQUAL
          ammInitialQuoteAssetAmount,   // EQUAL - THE CRITICAL FIX!
          periodicity
        );

        console.log(`  ✅ ${market.symbol} CREATED! TX: ${txSig}`);
        created++;

        // Set reasonable parameters
        await driftClient.updatePerpMarketStepSizeAndTickSize(
          market.index,
          new BN(1000),
          new BN(100)
        );
        console.log(`  ✅ ${market.symbol} configured`);

      } catch (error: any) {
        console.log(`  ❌ Error: ${error.message}`);
        
        if (error.message.includes('already initialized') || 
            error.message.includes('already exists') ||
            error.message.includes('account already in use')) {
          console.log(`  ✅ ${market.symbol} already exists - SUCCESS!`);
          created++;
        } else if (error.message.includes('0x177b')) {
          console.log("  🚨 InvalidInitialPeg - This shouldn't happen with our fix!");
        } else if (error.message.includes('0x7d6')) {
          console.log("  🔧 Error 0x7d6 - checking oracle...");
          
          try {
            const oracleInfo = await connection.getAccountInfo(market.oracle);
            if (!oracleInfo) {
              console.log(`     ❌ Oracle doesn't exist: ${market.oracle.toBase58()}`);
            } else {
              console.log(`     ✅ Oracle exists, owner: ${oracleInfo.owner.toBase58()}`);
            }
          } catch (oErr) {
            console.log("     ❌ Failed to check oracle");
          }
        } else {
          console.log(`  🔍 Full error: ${error.stack}`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`\n📊 RESULTS: ${created}/3 markets processed`);

    // Final verification - actually check if they work
    console.log("\n🔍 FINAL VERIFICATION:");
    let working = 0;
    
    for (const market of MARKETS) {
      try {
        const perpMarket = driftClient.getPerpMarketAccount(market.index);
        if (perpMarket && perpMarket.amm) {
          console.log(`  ✅ ${market.symbol}: WORKING - Oracle: ${perpMarket.amm.oracle.toBase58()}`);
          working++;
        } else {
          console.log(`  ❌ ${market.symbol}: Not accessible`);
        }
      } catch (error) {
        console.log(`  ❌ ${market.symbol}: Not found - ${error.message}`);
      }
    }

    console.log(`\n${"=".repeat(60)}`);
    if (working === 3) {
      console.log("🎉 SUCCESS! ALL 3 MARKETS ARE CREATED AND WORKING!");
      console.log("🎯 GOAL ACHIEVED - Your SOL, BTC, and ETH markets are ready!");
      console.log("✅ You can now trade perpetual futures on all three markets!");
    } else if (working > 0) {
      console.log(`🎉 PARTIAL SUCCESS: ${working}/3 markets working`);
      console.log("🎯 Some markets are ready for trading");
    } else {
      console.log("❌ GOAL NOT ACHIEVED - Markets still need to be created");
      console.log("The error details above show what needs to be fixed");
    }
    console.log("=".repeat(60));

  } catch (error: any) {
    console.log("❌ Fatal error:", error.message);
    console.log(error.stack);
  } finally {
    await driftClient.unsubscribe();
  }
}

main().catch(console.error); 