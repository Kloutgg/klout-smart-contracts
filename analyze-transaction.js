const { Connection } = require('@solana/web3.js');

async function main() {
  console.log("🔍 ANALYZING SPECIFIC TRANSACTION");
  console.log("=================================");
  
  const connection = new Connection("https://api.devnet.solana.com", 'confirmed');
  const txHash = "4GAdpYnvcaQCGg2cm4LwewXqtb471ShM9SGeTt6gNsj75VLA3rfDpk63VQohUWshaQqasFzkm19SrT7w71XrFDL4";
  
  try {
    console.log(`📋 Transaction: ${txHash}`);
    console.log(`🔗 Solscan: https://solscan.io/tx/${txHash}?cluster=devnet\n`);
    
    // Get transaction details
    const tx = await connection.getTransaction(txHash, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx) {
      console.log("❌ Transaction not found");
      return;
    }
    
    console.log(`✅ Transaction found`);
    console.log(`   Slot: ${tx.slot}`);
    console.log(`   Block Time: ${new Date(tx.blockTime * 1000).toISOString()}`);
    console.log(`   Status: ${tx.meta.err ? 'FAILED' : 'SUCCESS'}`);
    
    if (tx.meta.err) {
      console.log(`   Error: ${JSON.stringify(tx.meta.err)}`);
      return;
    }
    
    console.log(`   Compute Units Consumed: ${tx.meta.computeUnitsConsumed}`);
    console.log(`   Fee: ${tx.meta.fee / 1e9} SOL`);
    
    // Analyze logs
    console.log(`\n📝 Transaction Logs:`);
    if (tx.meta.logMessages) {
      tx.meta.logMessages.forEach((log, i) => {
        console.log(`   ${i + 1}. ${log}`);
      });
    }
    
    // Look for specific patterns
    console.log(`\n🔍 Key Information:`);
    let foundPlaceAndTake = false;
    let foundMarket4 = false;
    let foundAuction = false;
    let foundFill = false;
    let foundPosition = false;
    
    if (tx.meta.logMessages) {
      tx.meta.logMessages.forEach(log => {
        if (log.includes('PlaceAndTakePerpOrder')) {
          foundPlaceAndTake = true;
          console.log(`   ✅ PlaceAndTakePerpOrder instruction executed`);
        }
        if (log.includes('market 4')) {
          foundMarket4 = true;
          console.log(`   ✅ Market 4 (MNO-PERP) involved`);
        }
        if (log.includes('auction')) {
          foundAuction = true;
          console.log(`   ✅ Auction mechanism involved`);
        }
        if (log.includes('skipping auction')) {
          console.log(`   ✅ Auction skipped (permissive oracle working)`);
        }
        if (log.includes('fill') || log.includes('Fill')) {
          foundFill = true;
          console.log(`   ✅ Fill event detected`);
        }
        if (log.includes('Invalid Perp') && log.includes('Oracle')) {
          console.log(`   ⚠️  Oracle issue: ${log}`);
        }
      });
    }
    
    // Account changes analysis
    console.log(`\n💰 Account Changes:`);
    if (tx.meta.preBalances && tx.meta.postBalances) {
      for (let i = 0; i < tx.meta.preBalances.length; i++) {
        const preBalance = tx.meta.preBalances[i];
        const postBalance = tx.meta.postBalances[i];
        const change = postBalance - preBalance;
        
        if (change !== 0) {
          const account = tx.transaction.message.accountKeys[i];
          if (account) {
            console.log(`   Account ${i}: ${account.toBase58()}`);
            console.log(`     Balance change: ${change / 1e9} SOL`);
          }
        }
      }
    }
    
    // Summary
    console.log(`\n📊 Summary:`);
    console.log(`   PlaceAndTakePerpOrder: ${foundPlaceAndTake ? '✅' : '❌'}`);
    console.log(`   Market 4 (MNO): ${foundMarket4 ? '✅' : '❌'}`);
    console.log(`   Fill detected: ${foundFill ? '✅' : '❌'}`);
    console.log(`   Transaction success: ${tx.meta.err ? '❌' : '✅'}`);
    
    if (foundPlaceAndTake && !foundFill) {
      console.log(`\n💡 Analysis: Order was placed but may not have been filled immediately`);
      console.log(`   This could mean:`);
      console.log(`   • Order is waiting in the order book`);
      console.log(`   • AMM couldn't provide liquidity at that moment`);
      console.log(`   • Oracle issues prevented immediate fill`);
    }
    
  } catch (error) {
    console.log("❌ Error:", error.message);
  }
}

main().catch(console.error); 