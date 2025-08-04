const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { 
  AdminClient,
  BulkAccountLoader,
  Wallet,
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("4r69MyZAKmJ1UR21tndDKpkGXs9Pa9MuhzAVEtF5KZGY");

// MNO Market Configuration
const MNO_MARKET_INDEX = 4;
const PERMISSIVE_SLOT_DELAY = -1;

async function main() {
  console.log("🔧 FIXING MNO MARKET ORACLE CONFIGURATION");
  console.log("=========================================");
  
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  console.log("📝 Admin Wallet:", keypair.publicKey.toBase58());

  const provider = new anchor.AnchorProvider(
    new Connection(DEVNET_RPC, 'confirmed'),
    new Wallet(keypair),
    { commitment: 'confirmed', preflightCommitment: 'confirmed' }
  );
  
  console.log("💰 Balance:", ((await provider.connection.getBalance(keypair.publicKey)) / 1e9).toFixed(2), "SOL");

  // Create AdminClient
  const adminClient = new AdminClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { 
      commitment: 'confirmed',
      preflightCommitment: 'confirmed'
    },
    activeSubAccountId: 0,
    perpMarketIndexes: [0, 1, 2, 3, 4], // Include all markets
    spotMarketIndexes: [0],
    subAccountIds: [],
    accountSubscription: {
      type: 'polling',
      accountLoader: new BulkAccountLoader(provider.connection, 'confirmed', 1000),
    },
  });

  try {
    console.log("\n🔧 Initializing AdminClient...");
    await adminClient.subscribe();
    
    // Wait for state to load
    let retries = 0;
    while (retries < 5) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const state = adminClient.getStateAccount();
        if (state && state.admin) {
          console.log("✅ AdminClient ready");
          break;
        }
      } catch (error) {
        console.log(`   Loading... retry ${retries + 1}`);
      }
      retries++;
    }
    
    // Get current market state
    console.log(`\n📊 Current MNO Market State (Index: ${MNO_MARKET_INDEX}):`);
    const perpMarket = adminClient.getPerpMarketAccount(MNO_MARKET_INDEX);
    console.log(`   Oracle: ${perpMarket.amm.oracle.toBase58()}`);
    console.log(`   Current oracle_slot_delay_override: ${perpMarket.amm.oracleSlotDelayOverride}`);
    console.log(`   Base Spread: ${perpMarket.amm.baseSpread} (${perpMarket.amm.baseSpread/10000}%)`);
    
    // Fix oracle configuration
    console.log(`\n🔮 Setting oracle slot delay override to ${PERMISSIVE_SLOT_DELAY}...`);
    console.log("   This will enable immediate placeAndTakePerpOrder execution");
    
    try {
      // Use the program directly to build the instruction
      const perpMarketPublicKey = PublicKey.findProgramAddressSync([
        Buffer.from("perp_market"),
        new Uint8Array([MNO_MARKET_INDEX])
      ], DRIFT_PROGRAM_ID)[0];
      
      const statePublicKey = await adminClient.getStatePublicKey();
      
      const ix = await adminClient.program.methods
        .updatePerpMarketOracleSlotDelayOverride(PERMISSIVE_SLOT_DELAY)
        .accounts({
          admin: adminClient.wallet.publicKey,
          state: statePublicKey,
          perpMarket: perpMarketPublicKey,
        })
        .instruction();
      
      const tx = await adminClient.buildTransaction(ix);
      const result = await adminClient.sendTransaction(tx, [], adminClient.opts);
      
      console.log(`✅ Oracle configuration updated! TX: ${result.txSig}`);
      console.log(`   🔗 View: https://solscan.io/tx/${result.txSig}?cluster=devnet`);
      
      // Verify the update
      console.log("\n🔍 Verifying update...");
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const updatedMarket = adminClient.getPerpMarketAccount(MNO_MARKET_INDEX);
      console.log(`   Updated oracle_slot_delay_override: ${updatedMarket.amm.oracleSlotDelayOverride}`);
      
      if (updatedMarket.amm.oracleSlotDelayOverride === PERMISSIVE_SLOT_DELAY) {
        console.log("\n🎉 SUCCESS! MNO MARKET NOW HAS PERMISSIVE ORACLE!");
        console.log("✅ placeAndTakePerpOrder will work immediately");
        console.log("✅ No more oracle staleness issues");
        console.log("✅ Trades will execute instantly via AMM");
      } else {
        console.log("⚠️  Update may need a moment to propagate");
      }
      
    } catch (error) {
      console.log(`❌ Oracle update failed: ${error.message}`);
      if (error.logs) {
        console.log("Program logs:", error.logs);
      }
    }

    await adminClient.unsubscribe();
    
  } catch (error) {
    console.log("❌ Fatal error:", error.message);
    process.exit(1);
  }
}

main().catch(console.error); 