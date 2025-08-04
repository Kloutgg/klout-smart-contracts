const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { 
  BN, 
  TestClient,
  BulkAccountLoader,
  BASE_PRECISION,
  PEG_PRECISION,
  Wallet
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("4r69MyZAKmJ1UR21tndDKpkGXs9Pa9MuhzAVEtF5KZGY");
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC");

// Your team's working oracles
const ORACLES = [
  { symbol: 'SOL', oracle: new PublicKey('CAXyA9sH9vHdWYb2zY7AdK5gydSRRo2Z2Nzrfns9PFZi') },
  { symbol: 'BTC', oracle: new PublicKey('Bwt4PmNNn9oGA7rHXm31FULqACSfEkWnsAH2kn2hVYPy') },
  { symbol: 'ETH', oracle: new PublicKey('Cv9P85YP1rFf7W5yn77ZK4UjgzdvpoYiYsBHb55GvnfU') }
];

async function checkOracleData(connection, oracle, name) {
  try {
    const account = await connection.getAccountInfo(oracle);
    if (!account) {
      console.log(`  ❌ ${name}: No account`);
      return false;
    }
    
    console.log(`  ✅ ${name}: ${account.data.length} bytes, Owner: ${account.owner.toBase58()}`);
    
    // Try to read first few bytes to see if there's data
    if (account.data.length >= 8) {
      const firstBytes = Array.from(account.data.slice(0, 8))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      console.log(`     First 8 bytes: ${firstBytes}`);
    }
    
    return true;
  } catch (error) {
    console.log(`  ❌ ${name}: Error - ${error.message}`);
    return false;
  }
}

async function main() {
  console.log("🎯 DEBUG AND CREATE MARKETS");
  console.log("Debugging current state and trying different approaches\n");
  
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  console.log("📝 Wallet:", keypair.publicKey.toBase58());

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  const provider = new anchor.AnchorProvider(
    connection,
    new Wallet(keypair),
    { commitment: 'confirmed', preflightCommitment: 'confirmed' }
  );
  
  console.log("💰 Balance:", ((await connection.getBalance(keypair.publicKey)) / 1e9).toFixed(2), "SOL");

  // Check oracle data
  console.log("\n🔮 Checking Oracle Data:");
  for (const oracle of ORACLES) {
    await checkOracleData(connection, oracle.oracle, oracle.symbol);
  }

  const driftClient = new TestClient({
    connection: connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [0, 1, 2, 3, 4, 5], // Try more indices
    spotMarketIndexes: [0],
    oracleInfos: [],
    accountSubscription: {
      type: 'polling',
      accountLoader: new BulkAccountLoader(connection, 'confirmed', 0),
    },
  });

  try {
    // Initialize
    try {
      await driftClient.initialize(USDC_MINT, true);
      console.log("✅ Drift initialized");
    } catch (initError) {
      if (initError.message.includes('already initialized')) {
        console.log("✅ Drift already initialized");
      } else {
        throw initError;
      }
    }

    await driftClient.subscribe();
    await driftClient.fetchAccounts();
    
    const state = driftClient.getStateAccount();
    console.log(`\n📊 Current Drift State:`);
    console.log(`  Perp markets: ${state.numberOfMarkets}`);
    console.log(`  Spot markets: ${state.numberOfSpotMarkets}`);
    console.log(`  Admin: ${state.admin.toBase58()}`);
    console.log(`  Exchange paused: ${state.exchangePaused}`);

    // Check if any markets already exist
    console.log(`\n🔍 Checking existing markets (indices 0-5):`);
    for (let i = 0; i < 6; i++) {
      try {
        const perpMarket = driftClient.getPerpMarketAccount(i);
        if (perpMarket) {
          console.log(`  ✅ Market ${i} exists - Oracle: ${perpMarket.amm.oracle.toBase58()}`);
          console.log(`     Status: ${JSON.stringify(perpMarket.status)}`);
        }
      } catch (error) {
        console.log(`  ❌ Market ${i}: Not found`);
      }
    }

    // Try creating markets at different indices
    console.log(`\n🏭 Trying to create markets at different indices:`);
    
    const ammInitialQuoteAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const ammInitialBaseAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const periodicity = new BN(3600);
    
    console.log(`Equal reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    
    // Try SOL at different indices
    const solOracle = ORACLES[0].oracle;
    const indicesToTry = [0, 1, 2, 3, 4, 5];
    
    for (const marketIndex of indicesToTry) {
      console.log(`\nTrying SOL market at index ${marketIndex}:`);
      
      try {
        const txSig = await driftClient.initializePerpMarket(
          marketIndex,
          solOracle,
          ammInitialBaseAssetAmount,
          ammInitialQuoteAssetAmount,
          periodicity,
          PEG_PRECISION.mul(new BN(150)) // $150 peg
        );

        console.log(`✅ SUCCESS! SOL market created at index ${marketIndex}`);
        console.log(`TX: ${txSig}`);
        console.log(`🔗 View: https://solscan.io/tx/${txSig}?cluster=devnet`);
        
        // Verify
        await driftClient.fetchAccounts();
        const perpMarket = driftClient.getPerpMarketAccount(marketIndex);
        if (perpMarket && perpMarket.amm) {
          console.log(`✅ Verified - Oracle: ${perpMarket.amm.oracle.toBase58()}`);
          console.log("\n🎉 MARKET IS SUCCESSFULLY CREATED!");
          console.log("🎯 Your SOL perpetual market is ready for trading!");
          break; // Success!
        }

      } catch (error) {
        console.log(`❌ Index ${marketIndex} failed: ${error.message}`);
        
        if (error.message.includes('already initialized') || 
            error.message.includes('already exists')) {
          console.log(`✅ Market already exists at index ${marketIndex}!`);
          
          try {
            const perpMarket = driftClient.getPerpMarketAccount(marketIndex);
            if (perpMarket) {
              console.log(`✅ Existing market verified - Oracle: ${perpMarket.amm.oracle.toBase58()}`);
              console.log("\n🎉 MARKET ALREADY EXISTS!");
              console.log("🎯 Goal achieved - SOL perpetual market is ready!");
              break;
            }
          } catch (verifyError) {
            console.log("Could not verify existing market");
          }
        }
      }
    }

    // Try user account initialization (might be needed)
    console.log(`\n🔧 Checking user account status:`);
    try {
      await driftClient.initializeUserAccount(0);
      console.log("✅ User account initialized");
    } catch (userError) {
      if (userError.message.includes('already')) {
        console.log("✅ User account already exists");
      } else {
        console.log(`⚠️  User account error: ${userError.message}`);
      }
    }

    await driftClient.unsubscribe();

  } catch (error) {
    console.log("❌ Fatal error:", error.message);
    console.log("Stack:", error.stack);
  }
}

main().catch(console.error); 