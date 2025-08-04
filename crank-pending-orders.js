const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const USER_WALLET = "FNQrPwcUaH5KfFmDqoLNrNwkAQMoWfvaZpKsEkRtJ9At";
const DRIFT_PROGRAM_ID = new PublicKey("4r69MyZAKmJ1UR21tndDKpkGXs9Pa9MuhzAVEtF5KZGY");
const MNO_MARKET_INDEX = 4;

async function main() {
  console.log("🔧 CRANKING PENDING ORDERS FOR MNO-PERP");
  console.log("========================================");
  console.log(`👤 User Wallet: ${USER_WALLET}`);
  
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  console.log("📝 Cranker Wallet:", keypair.publicKey.toBase58());

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
    
    // Derive accounts
    const [stateAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("drift_state")],
      DRIFT_PROGRAM_ID
    );
    
    const [userAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("user")),
        new PublicKey(USER_WALLET).toBuffer(),
        new anchor.BN(0).toArrayLike(Buffer, 'le', 2) // subAccountId 0
      ],
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
    console.log(`   User Account: ${userAccount.toBase58()}`);
    console.log(`   Perp Market: ${perpMarketAccount.toBase58()}`);
    
    // First, let's check current orders
    console.log("\n📋 Checking current orders...");
    const userAccountData = await program.account.user.fetch(userAccount);
    
    console.log(`   User Authority: ${userAccountData.authority.toBase58()}`);
    console.log(`   Sub Account: ${userAccountData.subAccountId}`);
    
    // Check orders
    let pendingOrders = [];
    for (let i = 0; i < userAccountData.orders.length; i++) {
      const order = userAccountData.orders[i];
      if (order.marketIndex === MNO_MARKET_INDEX && order.baseAssetAmount.gt(new anchor.BN(0))) {
        pendingOrders.push({ index: i, order });
        console.log(`   📝 Order ${i}: Market ${order.marketIndex}, Amount: ${order.baseAssetAmount.toString()}`);
      }
    }
    
    if (pendingOrders.length === 0) {
      console.log("   ✅ No pending orders found for MNO-PERP");
      return;
    }
    
    console.log(`\n🎯 Found ${pendingOrders.length} pending order(s) to crank`);
    
    // Try to fill each pending order
    for (const { index, order } of pendingOrders) {
      console.log(`\n🔧 Attempting to fill order ${index}...`);
      
      try {
        // Use fillPerpOrder to manually fill the order
        const tx = await program.methods
          .fillPerpOrder(
            new anchor.BN(index) // order_id
          )
          .accounts({
            state: stateAccount,
            user: userAccount,
            userStats: userAccount, // Simplified for now
            authority: new PublicKey(USER_WALLET),
            filler: keypair.publicKey,
            fillerStats: userAccount, // Simplified
            perpMarket: perpMarketAccount,
            oracle: new PublicKey("AZp5Gt8Sb9GavYctAYAENYoXy2XR5LS9dkzbWWTLG58Y"),
          })
          .rpc();
        
        console.log(`   ✅ Order ${index} filled successfully!`);
        console.log(`   📝 Transaction: ${tx}`);
        console.log(`   🔗 View: https://solscan.io/tx/${tx}?cluster=devnet`);
        
      } catch (error) {
        console.log(`   ❌ Failed to fill order ${index}: ${error.message}`);
        
        // Try alternative approach: triggerOrder
        console.log(`   🔄 Trying alternative trigger approach...`);
        
        try {
          const triggerTx = await program.methods
            .triggerOrder(
              new PublicKey(USER_WALLET), // user_authority
              new anchor.BN(0), // user_sub_account_id  
              new anchor.BN(index) // order_id
            )
            .accounts({
              state: stateAccount,
              user: userAccount,
              perpMarket: perpMarketAccount,
              oracle: new PublicKey("AZp5Gt8Sb9GavYctAYAENYoXy2XR5LS9dkzbWWTLG58Y"),
              orderActionExplanation: keypair.publicKey, // Simplified
            })
            .rpc();
          
          console.log(`   ✅ Order ${index} triggered successfully!`);
          console.log(`   📝 Transaction: ${triggerTx}`);
          
        } catch (triggerError) {
          console.log(`   ❌ Trigger also failed: ${triggerError.message}`);
        }
      }
    }
    
    // Wait and check final status
    console.log("\n🔍 Waiting for settlement...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log("\n🎯 Final Status Check:");
    console.log("Please run: node check-position.js");
    console.log("To see if positions were created after cranking");
    
  } catch (error) {
    console.log("❌ Error:", error.message);
    
    if (error.logs) {
      console.log("\n📋 Program logs:");
      error.logs.forEach(log => console.log(`   ${log}`));
    }
    
    console.log("\n💡 Alternative Approach:");
    console.log("   Orders might fill naturally over time");
    console.log("   Or try a much smaller order size (0.01 units)");
    console.log("   The wide AMM spreads are the main issue");
  }
}

main().catch(console.error); 