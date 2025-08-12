const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { 
  BN, 
  TestClient, 
  BulkAccountLoader,
  OracleSource,
  BASE_PRECISION,
  PEG_PRECISION,
  Wallet
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("7a247Z1uc66BycPHmL7xuGps2Jrym9RQngiWwgqQCtYn");
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC");

// EXACT TEAM ORACLE CONFIGURATION
const MARKETS = [
    {
        fullName: 'Solana',
        category: ['L1', 'Infra'],
        symbol: 'SOL-PERP',
        baseAssetSymbol: 'SOL',
        marketIndex: 0,
        oracle: new PublicKey('CAXyA9sH9vHdWYb2zY7AdK5gydSRRo2Z2Nzrfns9PFZi'),
        launchTs: 1655751353000,
        oracleSource: OracleSource.PYTH_LAZER,
        pythFeedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
        pythLazerId: 6,
    },
    {
        fullName: 'Bitcoin',
        category: ['L1', 'Payment'],
        symbol: 'BTC-PERP',
        baseAssetSymbol: 'BTC',
        marketIndex: 1,
        oracle: new PublicKey('Bwt4PmNNn9oGA7rHXm31FULqACSfEkWnsAH2kn2hVYPy'),
        launchTs: 1655751353000,
        oracleSource: OracleSource.PYTH_LAZER,
        pythFeedId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
        pythLazerId: 1,
    },
    {
        fullName: 'Ethereum',
        category: ['L1', 'Infra'],
        symbol: 'ETH-PERP',
        baseAssetSymbol: 'ETH',
        marketIndex: 2,
        oracle: new PublicKey('Cv9P85YP1rFf7W5yn77ZK4UjgzdvpoYiYsBHb55GvnfU'),
        launchTs: 1637691133472,
        oracleSource: OracleSource.PYTH_LAZER,
        pythFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
        pythLazerId: 2,
    }
];

// Equal reserves fix
const ammInitialQuoteAssetAmount = new BN(1000).mul(BASE_PRECISION);
const ammInitialBaseAssetAmount = new BN(1000).mul(BASE_PRECISION);

async function main() {
  console.log("🎯 CREATING MARKETS WITH TEAM ORACLE CONFIG");
  
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  console.log("📝 Wallet:", keypair.publicKey.toBase58());

  const provider = new anchor.AnchorProvider(
    new Connection(DEVNET_RPC, 'confirmed'),
    new Wallet(keypair),
    { commitment: 'confirmed', preflightCommitment: 'confirmed' }
  );
  
  console.log("💰 Balance:", ((await provider.connection.getBalance(keypair.publicKey)) / 1e9).toFixed(2), "SOL");

  const bulkAccountLoader = new BulkAccountLoader(provider.connection, 'confirmed', 0);
  
  const driftClient = new TestClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [0, 1, 2],
    spotMarketIndexes: [0],
    oracleInfos: [],
    accountSubscription: {
      type: 'polling',
      accountLoader: bulkAccountLoader,
    },
  });

  try {
    // Initialize properly
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

    console.log(`\n🔧 Configuration:`);
    console.log(`  Equal reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    console.log(`  Base/Quote amount: ${ammInitialBaseAssetAmount.toString()}`);
    console.log(`  Oracle source: PYTH_LAZER\n`);

    const periodicity = new BN(3600);
    let successCount = 0;

    // Create markets in order
    for (const market of MARKETS) {
      console.log(`🏪 Creating ${market.symbol} (Index ${market.marketIndex})`);
      console.log(`  Oracle: ${market.oracle.toBase58()}`);
      console.log(`  Pyth Lazer ID: ${market.pythLazerId}`);
      console.log(`  Feed ID: ${market.pythFeedId}`);

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
        try {
          const perpMarket = driftClient.getPerpMarketAccount(market.marketIndex);
          if (perpMarket && perpMarket.amm) {
            console.log(`✅ ${market.symbol} verified - Oracle: ${perpMarket.amm.oracle.toBase58()}`);
          }
        } catch (verifyErr) {
          console.log(`⚠️  ${market.symbol} created but verification failed`);
        }

      } catch (error) {
        console.log(`❌ ${market.symbol} failed: ${error.message}`);
        
        if (error.message.includes('already initialized') || 
            error.message.includes('already exists')) {
          console.log(`✅ ${market.symbol} already exists!`);
          successCount++;
          
          // Try to verify existing market
          try {
            await driftClient.fetchAccounts();
            const perpMarket = driftClient.getPerpMarketAccount(market.marketIndex);
            if (perpMarket) {
              console.log(`✅ Existing ${market.symbol} verified`);
            }
          } catch (verifyError) {
            console.log("Could not verify existing market");
          }
        }
      }
      
      console.log(""); // Empty line between markets
    }

    // Final verification
    console.log(`🎯 FINAL RESULT: ${successCount}/${MARKETS.length} markets ready`);
    
    if (successCount > 0) {
      console.log("\n🎉 SUCCESS! Markets are set up!");
      
      // List all working markets
      console.log("\n📋 Working Markets:");
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
    } else {
      console.log("\n❌ No markets were successfully created");
    }

  } catch (error) {
    console.log("❌ Fatal error:", error.message);
    console.log("Stack:", error.stack);
  } finally {
    try {
      await driftClient.unsubscribe();
    } catch (err) {}
  }
}

main().catch(console.error); 