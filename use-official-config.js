const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { 
  BN, 
  TestClient,
  BulkAccountLoader,
  BASE_PRECISION,
  PEG_PRECISION,
  Wallet,
  Config
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";

async function main() {
  console.log("🎯 USING OFFICIAL DRIFT DEVNET CONFIGURATION");
  console.log("This should definitely work since it's the official setup\n");
  
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  console.log("📝 Wallet:", keypair.publicKey.toBase58());

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  const provider = new anchor.AnchorProvider(
    connection,
    new Wallet(keypair),
    { commitment: 'confirmed', preflightCommitment: 'confirmed' }
  );
  
  console.log("💰 Balance:", ((await connection.getBalance(keypair.publicKey)) / 1e9).toFixed(2), "SOL");

  // Get official devnet config
  const config = Config.devnet();
  console.log("\n🔧 Official Devnet Config:");
  console.log(`  Drift Program: ${config.DRIFT_PROGRAM_ID.toBase58()}`);
  console.log(`  USDC Mint: ${config.USDC_MINT_ADDRESS.toBase58()}`);
  
  // Get official perp markets
  const perpMarkets = config.PERP_MARKETS;
  console.log(`  Available markets: ${perpMarkets.length}`);
  
  for (let i = 0; i < Math.min(3, perpMarkets.length); i++) {
    const market = perpMarkets[i];
    console.log(`  ${market.symbol}: Oracle ${market.oracle.toBase58()}, Index ${market.marketIndex}`);
  }

  const driftClient = new TestClient({
    connection: connection,
    wallet: provider.wallet,
    programID: config.DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [0, 1, 2],
    spotMarketIndexes: [0],
    oracleInfos: [],
    accountSubscription: {
      type: 'polling',
      accountLoader: new BulkAccountLoader(connection, 'confirmed', 0),
    },
  });

  try {
    // Initialize with official USDC
    try {
      await driftClient.initialize(config.USDC_MINT_ADDRESS, true);
      console.log("✅ Drift initialized with official USDC");
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
    console.log(`\n📊 State: ${state.numberOfMarkets} perp, ${state.numberOfSpotMarkets} spot`);
    console.log(`Admin: ${state.admin.toBase58()}`);

    // Check if official markets already exist
    console.log(`\n🔍 Checking if official markets exist:`);
    let existingMarkets = 0;
    
    for (let i = 0; i < Math.min(3, perpMarkets.length); i++) {
      try {
        const perpMarket = driftClient.getPerpMarketAccount(i);
        if (perpMarket) {
          console.log(`  ✅ Market ${i} exists: ${perpMarkets[i].symbol}`);
          console.log(`     Oracle: ${perpMarket.amm.oracle.toBase58()}`);
          existingMarkets++;
        }
      } catch (error) {
        console.log(`  ❌ Market ${i}: Not found`);
      }
    }

    if (existingMarkets > 0) {
      console.log(`\n🎉 FOUND ${existingMarkets} EXISTING MARKETS!`);
      console.log("🎯 The official devnet markets are already available!");
      console.log("You can trade perpetual futures on these markets.");
    } else {
      // Try to create the first official market (SOL)
      console.log(`\n🏭 Creating official SOL market:`);
      
      const solMarket = perpMarkets[0]; // Should be SOL-PERP
      console.log(`Market: ${solMarket.symbol}`);
      console.log(`Oracle: ${solMarket.oracle.toBase58()}`);
      
      const ammInitialQuoteAssetAmount = new BN(1000).mul(BASE_PRECISION);
      const ammInitialBaseAssetAmount = new BN(1000).mul(BASE_PRECISION);
      const periodicity = new BN(3600);
      
      console.log(`Equal reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
      
      try {
        const txSig = await driftClient.initializePerpMarket(
          solMarket.marketIndex,
          solMarket.oracle,
          ammInitialBaseAssetAmount,
          ammInitialQuoteAssetAmount,
          periodicity,
          PEG_PRECISION.mul(new BN(150)) // $150 peg
        );

        console.log(`✅ SUCCESS! ${solMarket.symbol} market created!`);
        console.log(`TX: ${txSig}`);
        console.log(`🔗 View: https://solscan.io/tx/${txSig}?cluster=devnet`);
        
        // Verify
        await driftClient.fetchAccounts();
        const perpMarket = driftClient.getPerpMarketAccount(solMarket.marketIndex);
        if (perpMarket && perpMarket.amm) {
          console.log(`✅ Verified - Oracle: ${perpMarket.amm.oracle.toBase58()}`);
          console.log("\n🎉 OFFICIAL MARKET IS SUCCESSFULLY CREATED!");
          console.log("🎯 You can now trade SOL perpetual futures!");
        }

      } catch (error) {
        console.log(`❌ Official market creation failed: ${error.message}`);
        
        if (error.message.includes('already initialized') || 
            error.message.includes('already exists')) {
          console.log(`✅ Official market already exists!`);
          
          try {
            const perpMarket = driftClient.getPerpMarketAccount(solMarket.marketIndex);
            if (perpMarket) {
              console.log(`✅ Verified - Oracle: ${perpMarket.amm.oracle.toBase58()}`);
              console.log("\n🎉 OFFICIAL MARKET IS READY!");
              console.log("🎯 Goal achieved - SOL perpetual market exists!");
            }
          } catch (verifyError) {
            console.log("Could not verify existing market");
          }
        } else {
          console.log("Even the official configuration is failing.");
          console.log("This suggests an issue with the devnet Drift program state.");
          console.log("\n🔍 Your team should check:");
          console.log("1. If the Drift program on devnet is in a working state");
          console.log("2. If there are any prerequisites or setup steps missing");
          console.log("3. If the oracle data format has changed");
        }
      }
    }

    await driftClient.unsubscribe();

  } catch (error) {
    console.log("❌ Fatal error:", error.message);
    console.log("Stack:", error.stack);
  }
}

main().catch(console.error); 