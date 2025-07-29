const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { 
  DriftClient,
  BulkAccountLoader,
  Wallet,
  BASE_PRECISION,
  QUOTE_PRECISION,
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const TRADING_WALLET = "FNQrPwcUaH5KfFmDqoLNrNwkAQMoWfvaZpKsEkRtJ9At";  // Your actual trading wallet
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");

async function main() {
  console.log("🔍 CHECKING MNO-PERP POSITION STATUS");
  console.log("====================================");
  
  const tradingWalletPubkey = new PublicKey(TRADING_WALLET);
  console.log("📝 Trading Wallet:", tradingWalletPubkey.toBase58());

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  
  try {
    console.log("\n🔧 Looking up user account directly...");
    
    // Calculate user account PDA using the correct seeds
    const [userAccountPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("user")),
        tradingWalletPubkey.toBuffer(),
        new anchor.BN(0).toArrayLike(Buffer, 'le', 2) // subAccountId 0 as 2-byte LE
      ],
      DRIFT_PROGRAM_ID
    );
    
    console.log(`User Account PDA: ${userAccountPDA.toBase58()}`);
    
    // Get account data
    const accountInfo = await connection.getAccountInfo(userAccountPDA);
    if (!accountInfo) {
      console.log("❌ User account not found - user may not have initialized Drift yet");
      return;
    }
    
    console.log("✅ User account found, parsing data...");
    
    // Load the IDL to decode the account
    const idl = JSON.parse(fs.readFileSync('./target/idl/drift.json', 'utf8'));
    const program = new anchor.Program(idl, DRIFT_PROGRAM_ID, {
      connection,
      publicKey: tradingWalletPubkey
    });
    
    // Decode the user account
    const userAccount = program.coder.accounts.decode('User', accountInfo.data);
         
     console.log(`\n👤 User Account:`);
     console.log(`   Authority: ${userAccount.authority.toBase58()}`);
     console.log(`   Sub Account: ${userAccount.subAccountId}`);
     
     // Check all perp positions
     console.log(`\n📊 Perp Positions:`);
     let foundMNOPosition = false;
     
     for (let i = 0; i < userAccount.perpPositions.length; i++) {
       const position = userAccount.perpPositions[i];
       if (position.marketIndex === 4) { // MNO market
         foundMNOPosition = true;
         const baseAmount = position.baseAssetAmount;
         const quoteAmount = position.quoteAssetAmount;
         
         console.log(`   🎯 MNO-PERP Position Found!`);
         console.log(`      Market Index: ${position.marketIndex}`);
         console.log(`      Base Amount Raw: ${baseAmount.toString()}`);
         console.log(`      Base Amount (scaled): ${baseAmount.div(BASE_PRECISION).toString()}`);
         console.log(`      Quote Amount: ${quoteAmount.div(QUOTE_PRECISION).toString()}`);
         console.log(`      Last Cumulative Funding Rate: ${position.lastCumulativeFundingRate.toString()}`);
         
         if (baseAmount.gt(new anchor.BN(0))) {
           console.log(`   ✅ LONG position of ${baseAmount.div(BASE_PRECISION).toString()} units`);
         } else if (baseAmount.lt(new anchor.BN(0))) {
           console.log(`   ✅ SHORT position of ${baseAmount.abs().div(BASE_PRECISION).toString()} units`);
         } else {
           console.log(`   ⚠️  Position exists but base amount is 0`);
         }
       }
     }
     
     if (!foundMNOPosition) {
       console.log(`   ❌ No MNO-PERP position found`);
       console.log(`   📋 All positions:`);
       
       userAccount.perpPositions.forEach((pos, idx) => {
         if (pos.marketIndex < 255 && pos.marketIndex !== 255) { // Valid market index
           const baseAmount = pos.baseAssetAmount;
           if (!baseAmount.isZero()) {
             console.log(`      Market ${pos.marketIndex}: ${baseAmount.div(BASE_PRECISION).toString()} units (${baseAmount.gt(new anchor.BN(0)) ? 'LONG' : 'SHORT'})`);
           }
         }
       });
     }
     
     // Check orders
     console.log(`\n📋 Active Orders:`);
     let foundMNOOrders = false;
     
     for (let i = 0; i < userAccount.orders.length; i++) {
       const order = userAccount.orders[i];
       if (order.marketIndex === 4 && order.status !== 0) { // MNO market with active status
         foundMNOOrders = true;
         console.log(`   Order ${i}: Market ${order.marketIndex}, Status: ${order.status}, Amount: ${order.baseAssetAmount.toString()}`);
       }
     }
     
     if (!foundMNOOrders) {
       console.log(`   No active MNO-PERP orders`);
     }
    
  } catch (error) {
    console.log("❌ Error:", error.message);
  }
}

main().catch(console.error); 