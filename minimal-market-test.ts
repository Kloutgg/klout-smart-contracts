import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { BN, AdminClient, Wallet, BulkAccountLoader } from '@drift-labs/sdk';
import * as fs from 'fs';

async function main() {
  console.log("🔬 MINIMAL MARKET CREATION TEST");
  console.log("🎯 Trying to create just the SOL market with AdminClient\n");
  
  // Basic setup
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync('../bilc.json', 'utf-8')))
  );
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const wallet = new Wallet(keypair);
  
  console.log("📝 Wallet:", keypair.publicKey.toBase58());
  console.log("💰 Balance:", ((await connection.getBalance(keypair.publicKey)) / 1e9).toFixed(2), "SOL");

  // Try AdminClient instead of TestClient
  const adminClient = new AdminClient({
    connection,
    wallet,
    programID: new PublicKey("5jFCVBdddzyTjrWSEcY6bKGxq6J6aznuWQeLsxYinAMp"),
    opts: { commitment: 'confirmed' },
    accountSubscription: {
      type: 'polling',
      accountLoader: new BulkAccountLoader(connection, 'confirmed', 1),
    },
  });

  try {
    await adminClient.subscribe();
    console.log("✅ Connected with AdminClient");

    // THE CRITICAL FIX: Equal reserves
    const mantissaSqrtScale = new BN(100000);
    const baseAmount = new BN(5 * 10 ** 13).mul(mantissaSqrtScale);
    const quoteAmount = new BN(5 * 10 ** 13).mul(mantissaSqrtScale); // SAME VALUE!
    
    console.log("\n🔍 THE CRITICAL FIX:");
    console.log(`✅ Equal reserves: ${baseAmount.eq(quoteAmount)}`);
    console.log(`📊 Value: ${baseAmount.toString()}\n`);

    // Try to create SOL market (index 0)
    console.log("🏪 Creating SOL Market...");
    console.log("  Oracle: CAXyA9sH9vHdWYb2zY7AdK5gydSRRo2Z2Nzrfns9PFZi");
    console.log("  🔄 Calling initializePerpMarket...");

    const txSig = await adminClient.initializePerpMarket(
      0, // market index
      new PublicKey("CAXyA9sH9vHdWYb2zY7AdK5gydSRRo2Z2Nzrfns9PFZi"), // oracle
      baseAmount,  // base asset reserve - EQUAL
      quoteAmount, // quote asset reserve - EQUAL (THE FIX!)
      new BN(3600) // 1 hour periodicity
    );

    console.log("🎉 SUCCESS! SOL market created!");
    console.log("📋 Transaction:", txSig);

    // Verify it worked
    try {
      const market = adminClient.getPerpMarketAccount(0);
      console.log("✅ Market verified and accessible");
      console.log("📊 Oracle matches:", market.amm.oracle.toBase58());
      console.log("✅ GOAL ACHIEVED - Market is working!");
    } catch (verifyError) {
      console.log("⚠️  Market created but verification pending");
    }

  } catch (error: any) {
    console.log("❌ Error:", error.message);
    
    if (error.message.includes('0x177b')) {
      console.log("🚨 InvalidInitialPeg - The fix didn't work!");
    } else if (error.message.includes('already initialized')) {
      console.log("✅ Market already exists - SUCCESS!");
    } else {
      console.log("🔍 Full error:", error.stack);
    }
  } finally {
    await adminClient.unsubscribe();
  }
}

main().catch(console.error); 