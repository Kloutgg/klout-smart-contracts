const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { 
  getPythLazerOraclePublicKey,
  Wallet
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("4r69MyZAKmJ1UR21tndDKpkGXs9Pa9MuhzAVEtF5KZGY");

// Your oracle details
const ORACLES = [
  {
    symbol: 'SOL',
    pythLazerId: 6,
    expectedOracle: new PublicKey("CAXyA9sH9vHdWYb2zY7AdK5gydSRRo2Z2Nzrfns9PFZi"),
    pythFeedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'
  },
  {
    symbol: 'BTC',
    pythLazerId: 1,
    expectedOracle: new PublicKey("Bwt4PmNNn9oGA7rHXm31FULqACSfEkWnsAH2kn2hVYPy"),
    pythFeedId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43'
  },
  {
    symbol: 'ETH',
    pythLazerId: 2,
    expectedOracle: new PublicKey("Cv9P85YP1rFf7W5yn77ZK4UjgzdVpoYiYsBHb55GvnfU"),
    pythFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace'
  }
];

async function checkAccountInfo(connection, publicKey, name) {
  try {
    console.log(`\n🔍 Checking ${name}: ${publicKey.toBase58()}`);
    
    const accountInfo = await connection.getAccountInfo(publicKey);
    
    if (!accountInfo) {
      console.log(`  ❌ Account does not exist`);
      return { exists: false };
    }
    
    console.log(`  ✅ Account exists`);
    console.log(`  📊 Owner: ${accountInfo.owner.toBase58()}`);
    console.log(`  📏 Data length: ${accountInfo.data.length} bytes`);
    console.log(`  💰 Lamports: ${accountInfo.lamports}`);
    console.log(`  🔒 Executable: ${accountInfo.executable}`);
    console.log(`  📅 Rent epoch: ${accountInfo.rentEpoch}`);
    
    // Check if owned by Drift program
    const isDriftOwned = accountInfo.owner.equals(DRIFT_PROGRAM_ID);
    console.log(`  🏠 Owned by Drift: ${isDriftOwned ? '✅' : '❌'}`);
    
    // Show first few bytes of data (if any)
    if (accountInfo.data.length > 0) {
      const firstBytes = Array.from(accountInfo.data.slice(0, Math.min(32, accountInfo.data.length)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      console.log(`  📝 First bytes: ${firstBytes}${accountInfo.data.length > 32 ? '...' : ''}`);
      
      // Check if data is all zeros (uninitialized)
      const isAllZeros = accountInfo.data.every(byte => byte === 0);
      console.log(`  🔄 All zeros (uninitialized): ${isAllZeros ? '⚠️ YES' : '✅ NO'}`);
    }
    
    return {
      exists: true,
      owner: accountInfo.owner,
      dataLength: accountInfo.data.length,
      lamports: accountInfo.lamports,
      isDriftOwned,
      data: accountInfo.data
    };
    
  } catch (error) {
    console.log(`  ❌ Error checking account: ${error.message}`);
    return { exists: false, error: error.message };
  }
}

async function main() {
  console.log("🔍 ORACLE STATUS CHECKER");
  console.log("📋 Checking if oracles are properly initialized\n");
  
  // Load wallet
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  console.log("📝 Wallet:", keypair.publicKey.toBase58());

  // Setup connection
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  console.log("💰 Balance:", ((await connection.getBalance(keypair.publicKey)) / 1e9).toFixed(2), "SOL");

  console.log("\n" + "=".repeat(80));
  console.log("🔮 ORACLE ACCOUNT DIAGNOSTICS");
  console.log("=".repeat(80));

  let summary = {};

  for (const oracle of ORACLES) {
    console.log("\n" + "-".repeat(60));
    console.log(`🔮 ${oracle.symbol} ORACLE DIAGNOSTICS`);
    console.log("-".repeat(60));
    
    // Check computed oracle PDA
    const computedOracle = getPythLazerOraclePublicKey(DRIFT_PROGRAM_ID, oracle.pythLazerId);
    console.log(`📐 Computed Oracle PDA: ${computedOracle.toBase58()}`);
    console.log(`📍 Expected Oracle PDA: ${oracle.expectedOracle.toBase58()}`);
    console.log(`🎯 Addresses Match: ${computedOracle.equals(oracle.expectedOracle) ? '✅' : '❌'}`);
    
    if (!computedOracle.equals(oracle.expectedOracle)) {
      console.log(`⚠️  WARNING: Address mismatch! Using expected address for checks.`);
    }
    
    // Check the expected oracle account
    const oracleInfo = await checkAccountInfo(connection, oracle.expectedOracle, `${oracle.symbol} Oracle`);
    
    // Also check computed oracle if different
    let computedOracleInfo = null;
    if (!computedOracle.equals(oracle.expectedOracle)) {
      computedOracleInfo = await checkAccountInfo(connection, computedOracle, `${oracle.symbol} Computed Oracle`);
    }
    
    // Summary for this oracle
    summary[oracle.symbol] = {
      expectedExists: oracleInfo.exists,
      computedExists: computedOracleInfo ? computedOracleInfo.exists : null,
      isDriftOwned: oracleInfo.isDriftOwned,
      hasData: oracleInfo.exists && oracleInfo.dataLength > 0,
      pythLazerId: oracle.pythLazerId,
      pythFeedId: oracle.pythFeedId
    };
    
    console.log(`\n📊 ${oracle.symbol} Summary:`);
    console.log(`  Expected Oracle Exists: ${oracleInfo.exists ? '✅' : '❌'}`);
    console.log(`  Owned by Drift: ${oracleInfo.isDriftOwned ? '✅' : '❌'}`);
    console.log(`  Has Data: ${oracleInfo.exists && oracleInfo.dataLength > 0 ? '✅' : '❌'}`);
    console.log(`  Pyth Lazer ID: ${oracle.pythLazerId}`);
    console.log(`  Pyth Feed ID: ${oracle.pythFeedId}`);
  }

  // Overall summary
  console.log("\n" + "=".repeat(80));
  console.log("📋 OVERALL ORACLE STATUS SUMMARY");
  console.log("=".repeat(80));

  let allExist = true;
  let allDriftOwned = true;
  let allHaveData = true;
  
  for (const [symbol, info] of Object.entries(summary)) {
    console.log(`\n${symbol}:`);
    console.log(`  ✅ Account exists: ${info.expectedExists}`);
    console.log(`  ✅ Drift owned: ${info.isDriftOwned}`);
    console.log(`  ✅ Has data: ${info.hasData}`);
    console.log(`  📊 Pyth Lazer ID: ${info.pythLazerId}`);
    
    if (!info.expectedExists) allExist = false;
    if (!info.isDriftOwned) allDriftOwned = false;
    if (!info.hasData) allHaveData = false;
  }

  console.log("\n" + "=".repeat(80));
  console.log("🎯 DIAGNOSIS");
  console.log("=".repeat(80));
  
  if (allExist && allDriftOwned && allHaveData) {
    console.log("✅ ALL ORACLES PROPERLY INITIALIZED!");
    console.log("🎉 Oracles should work for market creation");
    console.log("💡 If markets still fail, the issue is elsewhere");
  } else {
    console.log("❌ ORACLE ISSUES FOUND:");
    
    if (!allExist) {
      console.log("  🚨 Some oracle accounts don't exist - need to initialize oracles first");
      console.log("  💡 Run: await driftClient.initializePythLazerOracle(feedId)");
    }
    
    if (!allDriftOwned) {
      console.log("  🚨 Some oracles not owned by Drift program - wrong addresses?");
    }
    
    if (!allHaveData) {
      console.log("  🚨 Some oracles exist but have no data - may need price updates");
      console.log("  💡 Oracles might need Pyth Lazer price data posts");
    }
  }

  console.log("\n🔧 NEXT STEPS:");
  if (!allExist) {
    console.log("  1. Initialize missing oracles using driftClient.initializePythLazerOracle()");
    console.log("  2. Ensure you have sufficient SOL for oracle creation");
    console.log("  3. Check if oracle initialization succeeds in your environment");
  } else if (!allHaveData) {
    console.log("  1. Oracles exist but may need price data updates");
    console.log("  2. Check if Pyth Lazer price updates are needed");
    console.log("  3. Try creating markets - they might work even with empty oracle data initially");
  } else {
    console.log("  1. Oracles look good - try market creation");
    console.log("  2. If markets still fail, investigate other program requirements");
    console.log("  3. Check transaction simulation logs for more specific errors");
  }
  
  console.log("=".repeat(80));
}

main().catch(console.error); 