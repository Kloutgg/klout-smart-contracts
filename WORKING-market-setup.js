const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { 
  BN, 
  TestClient,
  AdminClient,
  BulkAccountLoader,
  OracleSource,
  BASE_PRECISION,
  PEG_PRECISION,
  Wallet,
  getPythLazerOraclePublicKey
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("4r69MyZAKmJ1UR21tndDKpkGXs9Pa9MuhzAVEtF5KZGY");
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC");

// Team oracle configuration
const MARKETS = [
    {
        fullName: 'Solana',
        symbol: 'SOL-PERP',
        marketIndex: 0,
        oracle: new PublicKey('CAXyA9sH9vHdWYb2zY7AdK5gydSRRo2Z2Nzrfns9PFZi'),
        oracleSource: OracleSource.PYTH_LAZER,
        pythFeedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
        pythLazerId: 6,
    },
    {
        fullName: 'Bitcoin',
        symbol: 'BTC-PERP',
        marketIndex: 1,
        oracle: new PublicKey('Bwt4PmNNn9oGA7rHXm31FULqACSfEkWnsAH2kn2hVYPy'),
        oracleSource: OracleSource.PYTH_LAZER,
        pythFeedId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
        pythLazerId: 1,
    },
    {
        fullName: 'Ethereum',
        symbol: 'ETH-PERP',
        marketIndex: 2,
        oracle: new PublicKey('Cv9P85YP1rFf7W5yn77ZK4UjgzdvpoYiYsBHb55GvnfU'),
        oracleSource: OracleSource.PYTH_LAZER,
        pythFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
        pythLazerId: 2,
    }
];

async function checkOracleStatus(connection, oracle, name) {
  try {
    const account = await connection.getAccountInfo(oracle);
    if (account) {
      console.log(`  ✅ ${name} oracle exists: ${account.data.length} bytes, Owner: ${account.owner.toBase58()}`);
      return true;
    } else {
      console.log(`  ❌ ${name} oracle doesn't exist`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ ${name} oracle check failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log("🎯 WORKING MARKET SETUP WITH TEAM ORACLES - UPDATED VERSION");
  
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

  // Step 1: Check oracle status
  console.log("\n🔮 Checking Oracle Status:");
  for (const market of MARKETS) {
    console.log(`${market.symbol}:`);
    await checkOracleStatus(connection, market.oracle, market.symbol);
    
    // Also check if the computed oracle matches
    const computedOracle = getPythLazerOraclePublicKey(DRIFT_PROGRAM_ID, market.pythLazerId);
    console.log(`  Computed oracle: ${computedOracle.toBase58()}`);
    console.log(`  Provided oracle: ${market.oracle.toBase58()}`);
    console.log(`  Match: ${computedOracle.equals(market.oracle)}`);
  }

  // Step 2: Initialize AdminClient for oracle initialization 
  console.log("\n🔧 Initializing Pyth Lazer Oracles with AdminClient...");
  
  const bulkAccountLoader = new BulkAccountLoader(connection, 'confirmed', 1000);
  
  const adminClient = new AdminClient({
    connection: connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [0, 1, 2],
    spotMarketIndexes: [0],
    subAccountIds: [],
    accountSubscription: {
      type: 'polling',
      accountLoader: bulkAccountLoader,
    },
  });

  try {
    await adminClient.subscribe();
    console.log("✅ AdminClient subscribed");

    // Try to initialize any missing oracles
    for (const market of MARKETS) {
      console.log(`${market.symbol} (Lazer ID ${market.pythLazerId}):`);
      
      try {
        const txSig = await adminClient.initializePythLazerOracle(market.pythLazerId);
        console.log(`  ✅ Oracle initialized! TX: ${txSig}`);
      } catch (error) {
        if (error.message.includes('already initialized') || 
            error.message.includes('already exists')) {
          console.log(`  ✅ Oracle already initialized`);
        } else {
          console.log(`  ❌ Oracle initialization failed: ${error.message}`);
        }
      }
    }

    await adminClient.unsubscribe();

    // Step 3: Now use TestClient for market creation
    console.log("\n🏪 Setting up TestClient for market creation...");
    
    const driftClient = new TestClient({
      connection: connection,
      wallet: provider.wallet,
      programID: DRIFT_PROGRAM_ID,
      opts: { commitment: 'confirmed' },
      activeSubAccountId: 0,
      perpMarketIndexes: [0, 1, 2],
      spotMarketIndexes: [0],
      oracleInfos: [],
      accountSubscription: {
        type: 'polling',
        accountLoader: new BulkAccountLoader(connection, 'confirmed', 0),
      },
    });

    // Initialize Drift client properly
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
    console.log(`Current state: ${state.numberOfMarkets} perp markets, ${state.numberOfSpotMarkets} spot markets`);

    // Step 4: Create markets with equal reserves fix
    console.log("\n🏭 Creating Markets:");
    
    const ammInitialQuoteAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const ammInitialBaseAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const periodicity = new BN(3600);
    
    console.log(`Equal reserves fix: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    
    let successCount = 0;

    for (const market of MARKETS) {
      console.log(`\n🏪 Creating ${market.symbol} (Index ${market.marketIndex})`);
      console.log(`  Oracle: ${market.oracle.toBase58()}`);

      try {
        const txSig = await driftClient.initializePerpMarket(
          market.marketIndex,
          market.oracle,
          ammInitialBaseAssetAmount,
          ammInitialQuoteAssetAmount,
          periodicity
        );

        console.log(`✅ ${market.symbol} CREATED! TX: ${txSig}`);
        console.log(`🔗 View: https://solscan.io/tx/${txSig}?cluster=devnet`);
        successCount++;
        
        // Verify creation
        await driftClient.fetchAccounts();
        const perpMarket = driftClient.getPerpMarketAccount(market.marketIndex);
        if (perpMarket && perpMarket.amm) {
          console.log(`✅ ${market.symbol} verified - Oracle: ${perpMarket.amm.oracle.toBase58()}`);
        }

      } catch (error) {
        console.log(`❌ ${market.symbol} failed: ${error.message}`);
        
        if (error.message.includes('already initialized') || 
            error.message.includes('already exists')) {
          console.log(`✅ ${market.symbol} already exists!`);
          successCount++;
          
          // Try to verify existing market
          try {
            const perpMarket = driftClient.getPerpMarketAccount(market.marketIndex);
            if (perpMarket) {
              console.log(`✅ Existing ${market.symbol} verified`);
            }
          } catch (verifyError) {
            console.log("Could not verify existing market");
          }
        }
      }
    }

    // Final verification
    console.log(`\n🎯 FINAL RESULT: ${successCount}/${MARKETS.length} markets ready`);
    
    if (successCount > 0) {
      console.log("\n🎉 SUCCESS! Markets are set up!");
      
      // List all working markets
      console.log("\n📋 Working Markets:");
      await driftClient.fetchAccounts();
      for (const market of MARKETS) {
        try {
          const perpMarket = driftClient.getPerpMarketAccount(market.marketIndex);
          if (perpMarket) {
            console.log(`  ✅ ${market.symbol}: Index ${market.marketIndex}, Oracle ${perpMarket.amm.oracle.toBase58()}`);
          }
        } catch (err) {
          console.log(`  ❌ ${market.symbol}: Not accessible`);
        }
      }
      
      console.log("\n🚀 YOUR MARKETS ARE READY FOR TRADING!");
    } else {
      console.log("\n❌ No markets were successfully created");
    }

    await driftClient.unsubscribe();

  } catch (error) {
    console.log("❌ Fatal error:", error.message);
    console.log("Stack:", error.stack);
  }
}

main().catch(console.error); 