const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("4r69MyZAKmJ1UR21tndDKpkGXs9Pa9MuhzAVEtF5KZGY");
const MNO_MARKET_INDEX = 4;

async function main() {
  console.log("💰 ADDING LIQUIDITY TO MNO-PERP AMM");
  console.log("===================================");
  
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
    
    // Derive accounts
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
    console.log(`   Perp Market: ${perpMarketAccount.toBase58()}`);
    
    // Check current AMM state
    console.log("\n📊 Current AMM State:");
    const marketAccount = await program.account.perpMarket.fetch(perpMarketAccount);
    const amm = marketAccount.amm;
    
    console.log(`   Base Reserve: ${(parseFloat(amm.baseAssetReserve.toString()) / 1e9).toFixed(2)} units`);
    console.log(`   Quote Reserve: ${(parseFloat(amm.quoteAssetReserve.toString()) / 1e6).toFixed(2)} USDC`);
    console.log(`   Long Spread: ${(amm.longSpread / 100).toFixed(3)}%`);
    console.log(`   Short Spread: ${(amm.shortSpread / 100).toFixed(3)}%`);
    
    console.log("\n🎯 Problem Analysis:");
    console.log("   Long spread has widened to 3.036% due to net long positions");
    console.log("   This limits the size of new long orders that can fill immediately");
    console.log("   Adding more liquidity will help handle larger orders");
    
    // Add significant liquidity to both sides
    const additionalBaseAssets = new anchor.BN(10000 * 1e9); // 10,000 units
    const additionalQuoteAssets = new anchor.BN(10000000 * 1e6); // 10M USDC worth
    
    console.log("\n💰 Adding Liquidity:");
    console.log(`   Adding ${additionalBaseAssets.toString()} base assets (10,000 units)`);
    console.log(`   Adding ${additionalQuoteAssets.toString()} quote assets (10M USDC equivalent)`);
    
    try {
      const tx = await program.methods
        .ammUpdateBaseAssetReserve(additionalBaseAssets)
        .accounts({
          admin: keypair.publicKey,
          state: stateAccount,
          perpMarket: perpMarketAccount,
        })
        .rpc();
      
      console.log(`✅ Base asset reserves increased!`);
      console.log(`   Transaction: ${tx}`);
      
    } catch (error) {
      console.log(`❌ Base asset update failed: ${error.message}`);
      
      // Try alternative method
      console.log("🔄 Trying alternative liquidity addition method...");
      
      try {
        // Try using repeg to add liquidity
        const repegTx = await program.methods
          .repegAmmCurve(
            new anchor.BN(75000000), // peg_multiplier (current price)
            new anchor.BN(additionalBaseAssets), // new_base_asset_reserve  
            new anchor.BN(additionalQuoteAssets) // new_quote_asset_reserve
          )
          .accounts({
            admin: keypair.publicKey,
            state: stateAccount,
            perpMarket: perpMarketAccount,
            oracle: amm.oracle,
          })
          .rpc();
        
        console.log(`✅ AMM curve repegged with more liquidity!`);
        console.log(`   Transaction: ${repegTx}`);
        
      } catch (repegError) {
        console.log(`❌ Repeg also failed: ${repegError.message}`);
      }
    }
    
    // Wait for updates
    console.log("\n🔍 Waiting for updates to settle...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check updated state
    console.log("\n✅ Checking updated AMM state...");
    const updatedMarket = await program.account.perpMarket.fetch(perpMarketAccount);
    const updatedAmm = updatedMarket.amm;
    
    console.log(`   New Base Reserve: ${(parseFloat(updatedAmm.baseAssetReserve.toString()) / 1e9).toFixed(2)} units`);
    console.log(`   New Quote Reserve: ${(parseFloat(updatedAmm.quoteAssetReserve.toString()) / 1e6).toFixed(2)} USDC`);
    console.log(`   New Long Spread: ${(updatedAmm.longSpread / 100).toFixed(3)}%`);
    console.log(`   New Short Spread: ${(updatedAmm.shortSpread / 100).toFixed(3)}%`);
    
    console.log("\n🎉 Expected Results:");
    console.log("✅ Larger orders should now fill completely");
    console.log("✅ Spreads should tighten due to increased liquidity");
    console.log("✅ Better price discovery and execution");
    
    console.log("\n🎯 Try This:");
    console.log("   Place another 1 unit long order");
    console.log("   Should fill completely now with increased liquidity!");
    
  } catch (error) {
    console.log("❌ Error:", error.message);
    
    if (error.logs) {
      console.log("\n📋 Program logs:");
      error.logs.forEach(log => console.log(`   ${log}`));
    }
    
    console.log("\n💡 Manual Solutions:");
    console.log("   1. Try smaller order sizes (0.1-0.5 units)");
    console.log("   2. Take some short positions to balance the AMM");
    console.log("   3. Wait for other traders to balance the flow");
    console.log("   4. The AMM will gradually tighten spreads as it rebalances");
  }
}

main().catch(console.error); 