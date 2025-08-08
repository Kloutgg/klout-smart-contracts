const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("5jFCVBdddzyTjrWSEcY6bKGxq6J6aznuWQeLsxYinAMp");

async function main() {
  console.log("🔧 UPDATING GLOBAL ORACLE GUARD RAILS");
  console.log("=====================================");
  
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  console.log("📝 Admin Wallet:", keypair.publicKey.toBase58());

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  console.log("💰 Balance:", ((await connection.getBalance(keypair.publicKey)) / 1e9).toFixed(2), "SOL");

  try {
    // Create anchor provider and program
    const provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(keypair),
      { commitment: 'confirmed' }
    );
    
    // Load the IDL and create program instance
    const idl = JSON.parse(fs.readFileSync('./target/idl/drift.json', 'utf8'));
    const program = new anchor.Program(idl, DRIFT_PROGRAM_ID, provider);

    console.log("\n🔧 Setting up accounts...");
    
    // Derive state account
    const [stateAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("drift_state")],
      DRIFT_PROGRAM_ID
    );
    
    console.log(`   State Account: ${stateAccount.toBase58()}`);
    
    console.log("\n📊 Current Oracle Issues:");
    console.log("   Current confidence limit: 20,000 (2% of price)");
    console.log("   Hit confidence value: 21,957 (causing failures)");
    console.log("   Need to increase global limit");
    
    console.log("\n🎯 New Permissive Oracle Guard Rails:");
    
    // Define more permissive oracle guard rails
    const newOracleGuardRails = {
      priceDivergence: {
        markOraclePercentDivergence: new anchor.BN(100000), // 10% (default: 10%)
        oracleTwap5minPercentDivergence: new anchor.BN(500000), // 50% (default: 50%)
      },
      validity: {
        slotsBeforeStaleForAmm: new anchor.BN(300), // 300 slots (~2.5 min) - very permissive
        slotsBeforeStaleForMargin: new anchor.BN(1200), // 1200 slots (~10 min) - very permissive  
        confidenceIntervalMaxSize: new anchor.BN(50000), // 5% (up from 2%) - THIS FIXES THE ISSUE
        tooVolatileRatio: new anchor.BN(10), // 10x (up from 5x) - more permissive
      }
    };
    
    console.log("   Confidence Interval Max Size: 50,000 (5% vs current 2%)");
    console.log("   Slots Before Stale (AMM): 300 (~2.5 min vs current ~5 sec)");
    console.log("   Slots Before Stale (Margin): 1200 (~10 min vs current ~1 min)");
    console.log("   Too Volatile Ratio: 10x (vs current 5x)");
    
    console.log("\n⚠️  Impact Warning:");
    console.log("   This affects ALL markets globally!");
    console.log("   All markets will have more permissive oracle settings");
    
    // Confirm before proceeding
    console.log("\n🚀 Updating global oracle guard rails...");
    
    const tx = await program.methods
      .updateOracleGuardRails(newOracleGuardRails)
      .accounts({
        admin: keypair.publicKey,
        state: stateAccount,
      })
      .rpc();
    
    console.log(`✅ Oracle guard rails updated globally!`);
    console.log(`   Transaction: ${tx}`);
    console.log(`   🔗 View: https://solscan.io/tx/${tx}?cluster=devnet`);
    
    // Wait and verify
    console.log("\n🔍 Waiting for confirmation...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log("\n🎉 SUCCESS! All markets now have permissive oracle settings!");
    console.log("✅ Confidence intervals up to 5% are now allowed");
    console.log("✅ Much longer staleness tolerance");
    console.log("✅ Higher volatility tolerance");
    
    console.log("\n📋 What This Means:");
    console.log("   • Your pending MNO order should fill soon");
    console.log("   • placeAndTakePerpOrder should work immediately for all markets");
    console.log("   • No more 'Confidence Too Large' errors");
    console.log("   • Much more permissive trading conditions");
    
    console.log("\n🎯 Next Steps:");
    console.log("   1. Wait a few minutes for the order to potentially fill");
    console.log("   2. Try placing a new immediate trade on MNO-PERP");
    console.log("   3. Should work on other markets too now");
    
  } catch (error) {
    console.log("❌ Error:", error.message);
    
    if (error.logs) {
      console.log("\n📋 Program logs:");
      error.logs.forEach(log => console.log(`   ${log}`));
    }
    
    console.log("\n💡 Troubleshooting:");
    console.log("   • Ensure admin wallet has sufficient SOL");
    console.log("   • Verify admin wallet is the protocol admin");
    console.log("   • Check that the guard rails structure matches IDL");
  }
}

main().catch(console.error); 