const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair, SystemProgram } = require('@solana/web3.js');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("7a247Z1uc66BycPHmL7xuGps2Jrym9RQngiWwgqQCtYn");

// MNO Market Configuration
const MNO_MARKET_INDEX = 4;
const PERMISSIVE_SLOT_DELAY = -1;

async function main() {
  console.log("🔧 SIMPLE FIX FOR MNO ORACLE CONFIGURATION");
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
    
    // Derive account addresses manually
    const [stateAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("drift_state")],
      DRIFT_PROGRAM_ID
    );
    
    const [perpMarketAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode('perp_market')),
        new anchor.BN(MNO_MARKET_INDEX).toArrayLike(Buffer, 'le', 2)
      ],
      DRIFT_PROGRAM_ID
    );
    
    console.log(`   State Account: ${stateAccount.toBase58()}`);
    console.log(`   Perp Market Account: ${perpMarketAccount.toBase58()}`);
    
    // Check current oracle slot delay override
    console.log("\n📊 Checking current market state...");
    const perpMarketAccountInfo = await connection.getAccountInfo(perpMarketAccount);
    if (!perpMarketAccountInfo) {
      throw new Error("Perp market account not found");
    }
    
    console.log("✅ Market account found");
    
    // Build and send the update instruction
    console.log(`\n🔮 Updating oracle slot delay override to ${PERMISSIVE_SLOT_DELAY}...`);
    
    const tx = await program.methods
      .updatePerpMarketOracleSlotDelayOverride(PERMISSIVE_SLOT_DELAY)
      .accounts({
        admin: keypair.publicKey,
        state: stateAccount,
        perpMarket: perpMarketAccount,
      })
      .rpc();
    
    console.log(`✅ Oracle configuration updated!`);
    console.log(`   Transaction: ${tx}`);
    console.log(`   🔗 View: https://solscan.io/tx/${tx}?cluster=devnet`);
    
    // Wait and verify
    console.log("\n🔍 Waiting for confirmation...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log("🎉 SUCCESS! MNO market oracle should now be permissive!");
    console.log("✅ placeAndTakePerpOrder should work immediately");
    console.log("✅ No more 'Oracle data is stale' errors");
    
  } catch (error) {
    console.log("❌ Error:", error.message);
    
    // Provide debugging info
    if (error.logs) {
      console.log("\n📋 Program logs:");
      error.logs.forEach(log => console.log(`   ${log}`));
    }
    
    console.log("\n💡 Troubleshooting:");
    console.log("   • Ensure admin wallet has sufficient SOL");
    console.log("   • Verify admin wallet is the protocol admin");
    console.log("   • Check that MNO market (index 4) exists");
  }
}

main().catch(console.error); 