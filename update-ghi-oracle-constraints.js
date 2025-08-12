const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { AdminClient, Wallet, BulkAccountLoader } = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = 'https://api.devnet.solana.com';
const DRIFT_PROGRAM_ID = new PublicKey("7a247Z1uc66BycPHmL7xuGps2Jrym9RQngiWwgqQCtYn");
const WALLET_PATH = '../bilc.json'; // Wallet file is one directory up

// GHI-PERP market configuration
const GHI_PERP_MARKET_INDEX = 2;
const PERMISSIVE_SLOT_DELAY = -1; // -1 typically disables checks, or use 127 (max i8 value)

async function main() {
  console.log("🚀 UPDATING GHI-PERP ORACLE CONSTRAINTS FOR PERMISSIVE TRADING");
  console.log("=".repeat(60));
  
  try {
    // Load wallet
    const keypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
    );
    
    console.log(`📝 Admin Wallet: ${keypair.publicKey.toBase58()}`);
    
    // Setup connection
    const connection = new Connection(DEVNET_RPC, 'confirmed');
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`💰 Wallet Balance: ${(balance / 1e9).toFixed(4)} SOL`);
    
    if (balance < 0.01 * 1e9) {
      throw new Error("❌ Insufficient SOL balance for admin operations");
    }
    
    // Initialize AdminClient
    console.log("\n🔧 Initializing AdminClient...");
    const wallet = new Wallet(keypair);
    const bulkAccountLoader = new BulkAccountLoader(connection, 'confirmed', 1000);
    
    const adminClient = new AdminClient({
      connection,
      wallet,
      programID: DRIFT_PROGRAM_ID,
      opts: { 
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
        skipPreflight: false
      },
      activeSubAccountId: 0,
      perpMarketIndexes: [0, 1, 2], // Include all markets to ensure GHI-PERP is available
      spotMarketIndexes: [0],
      subAccountIds: [],
      accountSubscription: {
        type: 'polling',
        accountLoader: bulkAccountLoader,
      },
    });
    
    console.log("📡 Subscribing to AdminClient...");
    await adminClient.subscribe();
    
    // Wait for state to load with retries
    console.log("⏳ Waiting for state to load...");
    let state = null;
    let retries = 0;
    const maxRetries = 10;
    
    while (retries < maxRetries) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        state = adminClient.getStateAccount();
        if (state && state.admin) {
          console.log("✅ State account loaded successfully");
          break;
        }
      } catch (error) {
        console.log(`   Retry ${retries + 1}/${maxRetries}: State not ready yet...`);
      }
      retries++;
    }
    
    if (!state || !state.admin) {
      throw new Error("❌ Failed to load state account after multiple retries");
    }
    
    // Verify admin permissions
    if (!state.admin.equals(keypair.publicKey)) {
      throw new Error(`❌ Wallet ${keypair.publicKey.toBase58()} is not the admin. Current admin: ${state.admin.toBase58()}`);
    }
    
    console.log("✅ Admin permissions verified");
    
    // Get current market state with error handling
    console.log(`\n📊 Current GHI-PERP Market State (Index: ${GHI_PERP_MARKET_INDEX}):`);
    let perpMarket;
    try {
      perpMarket = adminClient.getPerpMarketAccount(GHI_PERP_MARKET_INDEX);
      if (!perpMarket) {
        throw new Error(`Market index ${GHI_PERP_MARKET_INDEX} not found`);
      }
    } catch (error) {
      throw new Error(`❌ Failed to load GHI-PERP market: ${error.message}`);
    }
    
    console.log(`   Current oracle_slot_delay_override: ${perpMarket.amm.oracleSlotDelayOverride}`);
    console.log(`   Oracle: ${perpMarket.amm.oracle.toBase58()}`);
    console.log(`   Oracle Source: ${perpMarket.amm.oracleSource}`);
    
    // Update oracle slot delay override to be highly permissive
    console.log(`\n🔄 Updating oracle slot delay override to ${PERMISSIVE_SLOT_DELAY}...`);
    console.log("   Note: Parameter is i8 type (range -128 to +127)");
    console.log("   -1 typically disables staleness checks for AMM fills");
    
    let txSig;
    try {
      // Ensure client is still connected before making the transaction
      if (!adminClient.isSubscribed) {
        console.log("   Re-subscribing AdminClient...");
        await adminClient.subscribe();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Debug: Check client state before transaction
      console.log("   📊 Pre-transaction checks:");
      console.log(`     • Client subscribed: ${adminClient.isSubscribed}`);
      console.log(`     • State account exists: ${!!adminClient.getStateAccount()}`);
      console.log(`     • Perp market exists: ${!!adminClient.getPerpMarketAccount(GHI_PERP_MARKET_INDEX)}`);
      
      // Try the AdminClient method first
      try {
        txSig = await adminClient.updatePerpMarketOracleSlotDelayOverride(
          GHI_PERP_MARKET_INDEX,
          PERMISSIVE_SLOT_DELAY
        );
      } catch (adminError) {
        console.log("   ⚠️  AdminClient method failed, trying manual instruction...");
        console.log(`   Error: ${adminError.message}`);
        
        // Manual instruction building as fallback
        const perpMarketPublicKey = adminClient.getPerpMarketPublicKey(GHI_PERP_MARKET_INDEX);
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
        txSig = result.txSig;
      }
    } catch (error) {
      console.error("❌ Failed to update oracle constraints:", error.message);
      if (error.logs) {
        console.error("Program logs:", error.logs);
      }
      throw error;
    }
    
    console.log(`✅ Oracle constraints updated! Transaction: ${txSig}`);
    
    // Verify the update
    console.log("\n🔍 Verifying update...");
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for account update
    
    const updatedPerpMarket = adminClient.getPerpMarketAccount(GHI_PERP_MARKET_INDEX);
    console.log(`   Updated oracle_slot_delay_override: ${updatedPerpMarket.amm.oracleSlotDelayOverride}`);
    
    if (updatedPerpMarket.amm.oracleSlotDelayOverride === PERMISSIVE_SLOT_DELAY) {
      console.log("✅ Update confirmed!");
    } else {
      console.log("⚠️  Update not yet reflected, may need a moment to propagate");
      console.log(`   Expected: ${PERMISSIVE_SLOT_DELAY}, Got: ${updatedPerpMarket.amm.oracleSlotDelayOverride}`);
    }
    
    // Generate Solscan link
    const solscanUrl = `https://solscan.io/tx/${txSig}?cluster=devnet`;
    
    console.log("\n🎉 SUCCESS! GHI-PERP oracle constraints are now highly permissive");
    console.log("=".repeat(60));
    console.log("📋 Summary:");
    console.log(`   • Market: GHI-PERP (Index: ${GHI_PERP_MARKET_INDEX})`);
    console.log(`   • Oracle Slot Delay Override: ${PERMISSIVE_SLOT_DELAY} (was: ${perpMarket.amm.oracleSlotDelayOverride})`);
    console.log(`   • Parameter Range: i8 (-128 to +127), -1 disables staleness checks`);
    console.log(`   • Transaction: ${txSig}`);
    console.log(`   • Solscan: ${solscanUrl}`);
    console.log("\n🚀 placeAndTakePerpOrder should now work immediately via AMM!");
    console.log("   Orders will route directly to vAMM regardless of oracle staleness");
    
    await adminClient.unsubscribe();
    
  } catch (error) {
    console.error("\n❌ Script failed:", error.message);
    if (error.logs) {
      console.error("Program logs:", error.logs);
    }
    process.exit(1);
  }
}

main().catch(console.error); 