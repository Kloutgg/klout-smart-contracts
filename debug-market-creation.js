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

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("4r69MyZAKmJ1UR21tndDKpkGXs9Pa9MuhzAVEtF5KZGY");
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC");

// Equal reserves fix
const ammInitialQuoteAssetAmount = new BN(1000).mul(BASE_PRECISION);
const ammInitialBaseAssetAmount = new BN(1000).mul(BASE_PRECISION);

async function main() {
  console.log("🔍 DEBUGGING MARKET CREATION");
  
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );

  const provider = new anchor.AnchorProvider(
    new Connection(DEVNET_RPC, 'confirmed'),
    new Wallet(keypair),
    { commitment: 'confirmed', preflightCommitment: 'confirmed' }
  );

  const bulkAccountLoader = new BulkAccountLoader(provider.connection, 'confirmed', 0);
  
  const driftClient = new TestClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [0, 1, 2, 3, 4], // Try more market indices
    spotMarketIndexes: [0],
    oracleInfos: [],
    accountSubscription: {
      type: 'polling',
      accountLoader: bulkAccountLoader,
    },
  });

  try {
    // Initialize using working pattern
    try {
      await driftClient.initialize(USDC_MINT, true);
    } catch (initError) {
      if (!initError.message.includes('already initialized')) {
        throw initError;
      }
    }

    await driftClient.subscribe();
    await driftClient.fetchAccounts();
    
    const state = driftClient.getStateAccount();
    console.log(`\n📊 Current state:`);
    console.log(`  Perp markets: ${state.numberOfMarkets}`);
    console.log(`  Spot markets: ${state.numberOfSpotMarkets}`);
    console.log(`  Admin: ${state.admin.toBase58()}`);

    // Check if any markets already exist
    console.log(`\n🔍 Checking existing markets:`);
    for (let i = 0; i < 5; i++) {
      try {
        const perpMarket = driftClient.getPerpMarketAccount(i);
        if (perpMarket) {
          console.log(`  ✅ Market ${i} exists - Oracle: ${perpMarket.amm.oracle.toBase58()}`);
        }
      } catch (error) {
        console.log(`  ❌ Market ${i}: Not found`);
      }
    }

    // Try creating a market at index 0 with your SOL oracle
    const solOracle = new PublicKey("CAXyA9sH9vHdWYb2zY7AdK5gydSRRo2Z2Nzrfns9PFZi");
    
    console.log(`\n🏪 Attempting SOL market creation:`);
    console.log(`  Index: 0`);
    console.log(`  Oracle: ${solOracle.toBase58()}`);
    console.log(`  Equal reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    
    try {
      const txSig = await driftClient.initializePerpMarket(
        0,  // index 0
        solOracle,
        ammInitialBaseAssetAmount,
        ammInitialQuoteAssetAmount,
        new BN(3600)
      );
      
      console.log(`✅ SOL MARKET CREATED! TX: ${txSig}`);
      
      // Verify immediately
      await driftClient.fetchAccounts();
      const perpMarket = driftClient.getPerpMarketAccount(0);
      if (perpMarket) {
        console.log(`✅ VERIFIED: Oracle ${perpMarket.amm.oracle.toBase58()}`);
        console.log("🎯 MARKET IS SET UP!");
      }
      
    } catch (error) {
      console.log(`❌ Creation failed: ${error.message}`);
      
      if (error.message.includes('already')) {
        console.log("✅ Market already exists!");
        
        try {
          await driftClient.fetchAccounts();
          const perpMarket = driftClient.getPerpMarketAccount(0);
          if (perpMarket) {
            console.log(`✅ Existing market verified: ${perpMarket.amm.oracle.toBase58()}`);
            console.log("🎯 MARKET IS ALREADY SET UP!");
          }
        } catch (verifyError) {
          console.log("Could not verify existing market");
        }
      } else {
        // Try different approach - maybe try index 1 or 2
        console.log("\n🔄 Trying different market index...");
        
        try {
          const txSig2 = await driftClient.initializePerpMarket(
            1,  // Try index 1
            solOracle,
            ammInitialBaseAssetAmount,
            ammInitialQuoteAssetAmount,
            new BN(3600)
          );
          
          console.log(`✅ SOL MARKET CREATED AT INDEX 1! TX: ${txSig2}`);
          console.log("🎯 MARKET IS SET UP!");
          
        } catch (error2) {
          console.log(`❌ Index 1 also failed: ${error2.message}`);
          
          // Last attempt with index 2
          try {
            const txSig3 = await driftClient.initializePerpMarket(
              2,  // Try index 2
              solOracle,
              ammInitialBaseAssetAmount,
              ammInitialQuoteAssetAmount,
              new BN(3600)
            );
            
            console.log(`✅ SOL MARKET CREATED AT INDEX 2! TX: ${txSig3}`);
            console.log("🎯 MARKET IS SET UP!");
            
          } catch (error3) {
            console.log(`❌ All indices failed. Last error: ${error3.message}`);
            console.log(`\n🔍 Error analysis:`);
            console.log(`  Original: ${error.message}`);
            console.log(`  Index 1: ${error2.message}`);
            console.log(`  Index 2: ${error3.message}`);
          }
        }
      }
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