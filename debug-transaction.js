const { Connection, PublicKey } = require('@solana/web3.js');

async function main() {
  console.log("🔍 DEBUGGING RECENT TRANSACTIONS");
  console.log("================================");
  
  const connection = new Connection("https://api.devnet.solana.com", 'confirmed');
  const walletPubkey = new PublicKey("BiLCTDe2KphnuAN4Ja6rT5Pt73QyzP3HWboZdUoFygi3");
  
  try {
    console.log("📋 Getting recent transactions...");
    
    // Get recent transaction signatures
    const signatures = await connection.getSignaturesForAddress(walletPubkey, { limit: 5 });
    
    console.log(`Found ${signatures.length} recent transactions:\n`);
    
    for (let i = 0; i < signatures.length; i++) {
      const sig = signatures[i];
      console.log(`${i + 1}. ${sig.signature}`);
      console.log(`   Slot: ${sig.slot}`);
      console.log(`   Status: ${sig.err ? 'FAILED' : 'SUCCESS'}`);
      console.log(`   🔗 https://solscan.io/tx/${sig.signature}?cluster=devnet`);
      
      if (sig.err) {
        console.log(`   Error: ${JSON.stringify(sig.err)}`);
      }
      
      // Get transaction details for recent ones
      if (i < 2) {
        try {
          const tx = await connection.getTransaction(sig.signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
          });
          
          if (tx && tx.meta && tx.meta.logMessages) {
            console.log(`   📝 Logs:`);
            tx.meta.logMessages.forEach(log => {
              if (log.includes('PlaceAndTakePerpOrder') || 
                  log.includes('market 4') || 
                  log.includes('Invalid Perp') ||
                  log.includes('auction')) {
                console.log(`      ${log}`);
              }
            });
          }
        } catch (err) {
          console.log(`   ⚠️ Could not fetch transaction details`);
        }
      }
      
      console.log('');
    }
    
  } catch (error) {
    console.log("❌ Error:", error.message);
  }
}

main().catch(console.error); 