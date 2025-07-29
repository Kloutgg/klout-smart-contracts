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
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC");

// Your team's working SOL oracle
const SOL_ORACLE = new PublicKey('CAXyA9sH9vHdWYb2zY7AdK5gydSRRo2Z2Nzrfns9PFZi');

async function main() {
  console.log("🎯 TRYING DIFFERENT MARKET PARAMETER COMBINATIONS");
  console.log("Based on working test patterns\n");
  
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

  const driftClient = new TestClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [0],
    spotMarketIndexes: [0],
    oracleInfos: [],
    accountSubscription: {
      type: 'polling',
      accountLoader: new BulkAccountLoader(provider.connection, 'confirmed', 0),
    },
  });

  try {
    // Initialize
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
    console.log(`Current state: ${state.numberOfMarkets} perp markets`);

    // Equal reserves (the critical fix)
    const ammInitialQuoteAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const ammInitialBaseAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const periodicity = new BN(3600); // 1 hour like tests
    
    console.log(`\n🔧 Equal reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    console.log(`Values: ${ammInitialBaseAssetAmount.toString()}`);

    // Try different parameter combinations
    const attempts = [
      {
        name: "Working Test Pattern (6 params with pegMultiplier)",
        params: [
          0,  // marketIndex
          SOL_ORACLE,  // oracle
          ammInitialBaseAssetAmount,  // baseAssetReserve
          ammInitialQuoteAssetAmount,  // quoteAssetReserve
          periodicity,  // periodicity
          PEG_PRECISION.mul(new BN(150))  // pegMultiplier like working tests
        ]
      },
      {
        name: "Standard 5 params (what we've been trying)",
        params: [
          0,
          SOL_ORACLE,
          ammInitialBaseAssetAmount,
          ammInitialQuoteAssetAmount,
          periodicity
        ]
      },
      {
        name: "Different pegMultiplier value",
        params: [
          0,
          SOL_ORACLE,
          ammInitialBaseAssetAmount,
          ammInitialQuoteAssetAmount,
          periodicity,
          PEG_PRECISION  // 1.0 peg multiplier
        ]
      }
    ];

    for (const attempt of attempts) {
      console.log(`\n🏪 Trying: ${attempt.name}`);
      console.log(`Parameters: ${attempt.params.length} params`);
      
      try {
        const txSig = await driftClient.initializePerpMarket(...attempt.params);
        
        console.log(`✅ SUCCESS! Market created with TX: ${txSig}`);
        console.log(`🔗 View: https://solscan.io/tx/${txSig}?cluster=devnet`);
        
        // Verify
        await driftClient.fetchAccounts();
        const perpMarket = driftClient.getPerpMarketAccount(0);
        if (perpMarket && perpMarket.amm) {
          console.log(`✅ Market verified - Oracle: ${perpMarket.amm.oracle.toBase58()}`);
          console.log(`✅ Reserves equal: ${perpMarket.amm.baseAssetReserve.eq(perpMarket.amm.quoteAssetReserve)}`);
          console.log("\n🎉 MARKET IS SUCCESSFULLY SET UP!");
          console.log("🎯 Goal achieved - you can now trade SOL perpetual futures!");
          break; // Success, no need to try other attempts
        }

      } catch (error) {
        console.log(`❌ Failed: ${error.message}`);
        
        if (error.message.includes('already initialized') || 
            error.message.includes('already exists')) {
          console.log(`✅ Market already exists!`);
          
          try {
            const perpMarket = driftClient.getPerpMarketAccount(0);
            if (perpMarket) {
              console.log(`✅ Existing market verified - Oracle: ${perpMarket.amm.oracle.toBase58()}`);
              console.log("\n🎉 MARKET ALREADY EXISTS AND IS WORKING!");
              console.log("🎯 Goal achieved - SOL perpetual market is ready!");
              break;
            }
          } catch (verifyError) {
            console.log("Could not verify existing market");
          }
        } else if (error.message.includes('0x177b')) {
          console.log("🚨 Still getting InvalidInitialPeg error");
          console.log(`Equal reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
        } else if (error.message.includes('0x7d6')) {
          console.log("🔧 Error 0x7d6 - parameter compatibility issue");
        } else if (error.message.includes('Program failed to complete')) {
          console.log("🔧 Program failed to complete - trying next combination");
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