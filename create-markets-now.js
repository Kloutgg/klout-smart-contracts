const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { 
  BN, 
  TestClient, 
  BulkAccountLoader,
  BASE_PRECISION,
  PEG_PRECISION,
  Wallet
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration - Using YOUR working oracles
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC"); // Your USDC

// CRITICAL FIX: Equal reserves
const ammInitialQuoteAssetAmount = new BN(100).mul(BASE_PRECISION);
const ammInitialBaseAssetAmount = new BN(100).mul(BASE_PRECISION); // EQUAL!

// YOUR WORKING ORACLES (confirmed to exist with data)
const MARKETS = [
  {
    symbol: 'SOL',
    index: 0,
    oracle: new PublicKey("CAXyA9sH9vHdWYb2zY7AdK5gydSRRo2Z2Nzrfns9PFZi"), // YOUR oracle
    pegMultiplier: new BN(150).mul(PEG_PRECISION)
  },
  {
    symbol: 'BTC', 
    index: 1,
    oracle: new PublicKey("Bwt4PmNNn9oGA7rHXm31FULqACSfEkWnsAH2kn2hVYPy"), // YOUR oracle
    pegMultiplier: new BN(65000).mul(PEG_PRECISION)
  }
  // Skip ETH for now since that oracle doesn't exist
];

async function main() {
  console.log("🎯 CREATING MARKETS NOW - Using YOUR working oracles");
  
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

  const bulkAccountLoader = new BulkAccountLoader(provider.connection, 'confirmed', 0);
  
  const driftClient = new TestClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [0, 1],
    spotMarketIndexes: [0],
    oracleInfos: [],
    accountSubscription: {
      type: 'polling',
      accountLoader: bulkAccountLoader,
    },
  });

  try {
    // Initialize with YOUR USDC
    try {
      await driftClient.initialize(USDC_MINT, true);
      console.log("✅ Drift initialized");
    } catch (initError) {
      if (initError.message.includes('already initialized')) {
        console.log("✅ Drift already initialized");
      } else {
        throw initError;
      }
    }

    await driftClient.subscribe();
    await driftClient.fetchAccounts();
    
    const state = driftClient.getStateAccount();
    console.log(`Current markets: ${state.numberOfMarkets} perp, ${state.numberOfSpotMarkets} spot`);

    console.log(`\n🔧 EQUAL RESERVES FIX: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    console.log(`Base/Quote: ${ammInitialBaseAssetAmount.toString()}\n`);

    const periodicity = new BN(3600);
    let created = 0;

    // CREATE MARKETS WITH YOUR ORACLES
    for (const market of MARKETS) {
      console.log(`\n🏪 Creating ${market.symbol} Market`);
      console.log(`Oracle: ${market.oracle.toBase58()}`);

      try {
        const txSig = await driftClient.initializePerpMarket(
          market.index,
          market.oracle,
          ammInitialBaseAssetAmount,    // EQUAL
          ammInitialQuoteAssetAmount,   // EQUAL 
          periodicity
        );

        console.log(`✅ ${market.symbol} CREATED! TX: ${txSig}`);
        created++;

        await driftClient.fetchAccounts();
        
        // Configure market
        await driftClient.updatePerpMarketStepSizeAndTickSize(
          market.index,
          new BN(1000),
          new BN(100)
        );
        console.log(`✅ ${market.symbol} configured`);

      } catch (error) {
        console.log(`❌ ${market.symbol} Error: ${error.message}`);
        
        if (error.message.includes('already initialized') || 
            error.message.includes('already exists')) {
          console.log(`✅ ${market.symbol} already exists - SUCCESS!`);
          created++;
        } else if (error.message.includes('0x177b')) {
          console.log(`🚨 STILL GETTING 0x177b - Equal reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
        }
      }
    }

    // VERIFY CREATED MARKETS
    console.log(`\n🔍 VERIFICATION - Created ${created}/${MARKETS.length} markets`);
    await driftClient.fetchAccounts();
    
    let working = 0;
    for (const market of MARKETS) {
      try {
        const perpMarket = driftClient.getPerpMarketAccount(market.index);
        if (perpMarket && perpMarket.amm) {
          console.log(`✅ ${market.symbol}: WORKING - Oracle: ${perpMarket.amm.oracle.toBase58()}`);
          working++;
        }
      } catch (error) {
        console.log(`❌ ${market.symbol}: Not accessible`);
      }
    }

    if (working > 0) {
      console.log(`\n🎉 SUCCESS: ${working} markets are working!`);
      console.log("🎯 MARKETS ARE SET UP!");
    } else {
      console.log("\n❌ No markets working yet");
    }

  } catch (error) {
    console.log("❌ Fatal error:", error.message);
  } finally {
    try {
      await driftClient.unsubscribe();
    } catch (err) {}
  }
}

main().catch(console.error); 