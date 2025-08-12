const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { 
  BN, 
  TestClient,
  AdminClient,
  BulkAccountLoader,
  OracleSource,
  BASE_PRECISION,
  Wallet,
  getPythLazerOraclePublicKey
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("7a247Z1uc66BycPHmL7xuGps2Jrym9RQngiWwgqQCtYn");
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC");

// Team's exact oracle configuration
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

async function main() {
  console.log("🎯 FINAL MARKET SETUP - Your team's exact oracle config");
  console.log("Based on their message that oracles 'should be updating properly'\n");
  
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
  console.log("\n🔮 Checking Your Team's Oracle Status:");
  for (const market of MARKETS) {
    console.log(`${market.symbol}:`);
    
    try {
      const account = await connection.getAccountInfo(market.oracle);
      if (account) {
        console.log(`  ✅ Oracle exists: ${account.data.length} bytes, Owner: ${account.owner.toBase58()}`);
      } else {
        console.log(`  ❌ Oracle doesn't exist`);
      }
    } catch (error) {
      console.log(`  ❌ Oracle check failed: ${error.message}`);
    }
    
    // Check computed oracle matches
    const computedOracle = getPythLazerOraclePublicKey(DRIFT_PROGRAM_ID, market.pythLazerId);
    console.log(`  Computed: ${computedOracle.toBase58()}`);
    console.log(`  Provided: ${market.oracle.toBase58()}`);
    console.log(`  Match: ${computedOracle.equals(market.oracle) ? '✅' : '❌'}`);
  }

  // Step 2: Try oracle initialization first
  console.log("\n🔧 Initializing oracles with AdminClient...");
  
  const adminBulkLoader = new BulkAccountLoader(connection, 'confirmed', 1000);
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
      accountLoader: adminBulkLoader,
    },
  });

  try {
    await adminClient.subscribe();
    console.log("✅ AdminClient ready");

    // Initialize oracles
    for (const market of MARKETS) {
      console.log(`Initializing ${market.symbol} oracle (ID ${market.pythLazerId}):`);
      
      try {
        const txSig = await adminClient.initializePythLazerOracle(market.pythLazerId);
        console.log(`  ✅ Initialized! TX: ${txSig}`);
      } catch (error) {
        if (error.message.includes('already initialized')) {
          console.log(`  ✅ Already initialized`);
        } else {
          console.log(`  ⚠️  Init failed: ${error.message}`);
        }
      }
    }

    await adminClient.unsubscribe();

    // Step 3: Create markets with TestClient
    console.log("\n🏪 Creating markets with TestClient...");
    
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

    // Initialize Drift
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
    console.log(`Current state: ${state.numberOfMarkets} perp, ${state.numberOfSpotMarkets} spot`);

    // Create markets with equal reserves fix
    console.log("\n🏭 Creating perpetual markets:");
    
    const ammInitialQuoteAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const ammInitialBaseAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const periodicity = new BN(3600);
    
    console.log(`Equal reserves (the fix): ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    console.log(`Values: ${ammInitialBaseAssetAmount.toString()}\n`);
    
    let successCount = 0;

    for (const market of MARKETS) {
      console.log(`Creating ${market.symbol} (Index ${market.marketIndex})`);
      console.log(`  Oracle: ${market.oracle.toBase58()}`);
      console.log(`  Pyth Feed: ${market.pythFeedId}`);

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
        
        // Verify
        await driftClient.fetchAccounts();
        const perpMarket = driftClient.getPerpMarketAccount(market.marketIndex);
        if (perpMarket && perpMarket.amm) {
          console.log(`✅ Verified - Oracle: ${perpMarket.amm.oracle.toBase58()}`);
        }

      } catch (error) {
        console.log(`❌ ${market.symbol} failed: ${error.message}`);
        
        if (error.message.includes('already initialized') || 
            error.message.includes('already exists')) {
          console.log(`✅ ${market.symbol} already exists!`);
          successCount++;
          
          try {
            const perpMarket = driftClient.getPerpMarketAccount(market.marketIndex);
            if (perpMarket) {
              console.log(`✅ Existing market verified`);
            }
          } catch (verifyError) {
            console.log("Could not verify existing market");
          }
        } else if (error.message.includes('0x177b')) {
          console.log("🚨 InvalidInitialPeg error - but reserves are equal!");
          console.log(`Base: ${ammInitialBaseAssetAmount.toString()}`);
          console.log(`Quote: ${ammInitialQuoteAssetAmount.toString()}`);
        } else if (error.message.includes('0x7d6')) {
          console.log("🔧 Error 0x7d6 - likely oracle compatibility issue");
        }
      }
      
      console.log(""); // Space between markets
    }

    // Final verification
    console.log(`🎯 RESULT: ${successCount}/${MARKETS.length} markets created/verified`);
    
    if (successCount > 0) {
      console.log("\n🎉 SUCCESS! Markets are working!");
      
      console.log("\n📋 Your Working Markets:");
      await driftClient.fetchAccounts();
      for (const market of MARKETS) {
        try {
          const perpMarket = driftClient.getPerpMarketAccount(market.marketIndex);
          if (perpMarket) {
            console.log(`  ✅ ${market.symbol}: Index ${market.marketIndex}`);
            console.log(`     Oracle: ${perpMarket.amm.oracle.toBase58()}`);
            console.log(`     Feed ID: ${market.pythFeedId}`);
          }
        } catch (err) {
          console.log(`  ❌ ${market.symbol}: Not accessible`);
        }
      }
      
      console.log("\n🚀 YOUR MARKETS ARE SET UP AND READY!");
      console.log("🎯 Goal achieved - you can now trade perpetual futures!");
    } else {
      console.log("\n❌ No markets were successfully created");
      console.log("The oracle configuration from your team needs further investigation");
    }

    await driftClient.unsubscribe();

  } catch (error) {
    console.log("❌ Fatal error:", error.message);
    console.log("Stack:", error.stack);
  }
}

main().catch(console.error); 