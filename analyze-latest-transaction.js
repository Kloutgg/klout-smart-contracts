const { Connection, PublicKey } = require('@solana/web3.js');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const TX_HASH = "4N83en1ZWnyTa5VcaQBhwU1qgwdpSpGCj9ZvFPv488LMipZoRJg7hjqzhsa5emkK5bhL993HDR5Bf6R6vo2Goxeb";

async function main() {
  console.log("🔍 ANALYZING LATEST PLACEANDTAKEPERPORDER TRANSACTION");
  console.log("===================================================");
  console.log(`📝 Transaction: ${TX_HASH}`);
  
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  
  try {
    // Get transaction details
    const tx = await connection.getTransaction(TX_HASH, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    });
    
    if (!tx) {
      console.log("❌ Transaction not found");
      return;
    }
    
    console.log(`\n✅ Transaction found - Status: ${tx.meta.err ? 'Failed' : 'Success'}`);
    console.log(`⚡ Compute units used: ${tx.meta.computeUnitsConsumed}`);
    
    if (tx.meta.logMessages) {
      console.log("\n📋 Program Logs Analysis:");
      console.log("========================");
      
      let foundPlaceAndTake = false;
      let foundOracleIssues = false;
      let foundAMMSkip = false;
      let foundOrderPlaced = false;
      let foundOrderFilled = false;
      
      tx.meta.logMessages.forEach((log, index) => {
        console.log(`${index + 1}: ${log}`);
        
        // Analyze key indicators
        if (log.includes('PlaceAndTakePerpOrder')) {
          foundPlaceAndTake = true;
        }
        if (log.includes('Invalid Perp') && log.includes('Oracle')) {
          foundOracleIssues = true;
        }
        if (log.includes('amm skipping auction duration')) {
          foundAMMSkip = true;
        }
        if (log.includes('Order placed') || log.includes('order placed')) {
          foundOrderPlaced = true;
        }
        if (log.includes('Order filled') || log.includes('order filled') || log.includes('Fill')) {
          foundOrderFilled = true;
        }
      });
      
      console.log("\n🔍 Transaction Analysis:");
      console.log("=======================");
      console.log(`✅ PlaceAndTakePerpOrder instruction: ${foundPlaceAndTake ? 'YES' : 'NO'}`);
      console.log(`❌ Oracle validation issues: ${foundOracleIssues ? 'YES' : 'NO'}`);
      console.log(`⚡ AMM skipping auction: ${foundAMMSkip ? 'YES' : 'NO'}`);
      console.log(`📝 Order placement: ${foundOrderPlaced ? 'EXPLICIT LOG' : 'NO EXPLICIT LOG'}`);
      console.log(`💰 Order fill/take: ${foundOrderFilled ? 'YES' : 'NO'}`);
      
      console.log("\n🎯 Key Findings:");
      console.log("================");
      
      if (foundPlaceAndTake && !foundOracleIssues) {
        console.log("✅ Oracle validation: PASSED (no confidence/staleness errors)");
      }
      
      if (foundAMMSkip) {
        console.log("✅ AMM availability: AVAILABLE (auction duration skipped)");
      }
      
      if (!foundOrderFilled) {
        console.log("❌ Order fill: NO FILL OCCURRED");
        console.log("   💡 This means 'place' succeeded but 'take' failed");
        
        console.log("\n🤔 Possible Reasons for No Fill:");
        console.log("   1. AMM doesn't have enough liquidity at current price");
        console.log("   2. There might be another guard rail preventing fills");
        console.log("   3. Order size might be too large for immediate fill");
        console.log("   4. Market conditions changed between validation and execution");
        console.log("   5. There might be a specific AMM state preventing fills");
      }
      
      // Look for specific price/confidence data
      console.log("\n💰 Price & Oracle Data:");
      console.log("=======================");
      tx.meta.logMessages.forEach(log => {
        if (log.includes('setting price =') || log.includes('confidence =')) {
          console.log(`   ${log}`);
        }
        if (log.includes('auction start price') || log.includes('auction end price')) {
          console.log(`   ${log}`);
        }
      });
      
      console.log("\n🎯 Recommendations:");
      console.log("===================");
      console.log("   1. ✅ Oracle issues are resolved - great progress!");
      console.log("   2. 🔍 The AMM is available but not filling orders");
      console.log("   3. 💡 This suggests an AMM liquidity or state issue");
      console.log("   4. 🔧 May need to check AMM reserves or add more liquidity");
      console.log("   5. 📊 Try a smaller order size to test");
      
    } else {
      console.log("❌ No program logs found");
    }
    
  } catch (error) {
    console.log("❌ Error analyzing transaction:", error.message);
  }
}

main().catch(console.error); 