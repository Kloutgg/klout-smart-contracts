const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("4r69MyZAKmJ1UR21tndDKpkGXs9Pa9MuhzAVEtF5KZGY");

async function main() {
  console.log("🔧 FIXING MNO ORACLE CONFIDENCE GUARD RAILS");
  console.log("==========================================");
  
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
    
    // Derive account addresses
    const [stateAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("drift_state")],
      DRIFT_PROGRAM_ID
    );
    
    console.log(`   State Account: ${stateAccount.toBase58()}`);
    
    // The current oracle guard rails that are causing issues:
    // confidence_interval_max_size: 20,000 (current limit)
    // confidence_too_large threshold: 21,957 (what we're hitting)
    
    console.log("\n📊 Current Issue:");
    console.log("   Confidence interval: 21,957 (too large)");
    console.log("   Current limit: ~20,000");
    console.log("   Need to increase limit for permissive trading");
    
    // Unfortunately, looking at the Drift code, oracle confidence guard rails 
    // are set at the GLOBAL level, not per-market level
    // We need to update the global OracleGuardRails
    
    console.log("\n💡 Oracle Guard Rails Structure:");
    console.log("   ⚠️  Oracle confidence limits are GLOBAL (not per-market)");
    console.log("   📋 Current guard rails likely include:");
    console.log("      • confidence_interval_max_size: 20,000");
    console.log("      • slots_before_stale_for_amm: 10");
    console.log("      • slots_before_stale_for_margin: 120");
    
    // Let's check what guard rail update functions are available
    console.log("\n🔍 Available Solutions:");
    console.log("   1. Update global oracle guard rails (affects all markets)");
    console.log("   2. Force-fill the existing order manually");
    console.log("   3. Cancel order and retry with different parameters");
    
    console.log("\n🎯 Recommended Action:");
    console.log("   Since oracle confidence is GLOBAL, the cleanest solution is:");
    console.log("   1. Cancel the pending order");
    console.log("   2. Try a smaller order size (might have different confidence impact)");
    console.log("   3. Or wait for oracle confidence to improve");
    
    console.log("\n📋 Your Current Situation:");
    console.log("   • You have 1 order pending in the MNO-PERP order book");
    console.log("   • Order amount: 1 unit (1000000000 raw)"); 
    console.log("   • Order status: Waiting for fill");
    console.log("   • Oracle confidence too high for immediate AMM fill");
    
    console.log("\n💡 Next Steps:");
    console.log("   1. The order might fill naturally when oracle confidence improves");
    console.log("   2. Or we can cancel it and try a different approach");
    console.log("   3. Check if there are any makers who might fill the order");
    
  } catch (error) {
    console.log("❌ Error:", error.message);
  }
}

main().catch(console.error); 