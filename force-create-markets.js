const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { 
  BN, 
  AdminClient,
  BulkAccountLoader,
  OracleSource,
  ContractTier,
  BASE_PRECISION,
  PRICE_PRECISION,
  PEG_PRECISION,
  ZERO,
  ONE,
  Wallet
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration - Using YOUR working oracles
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC");

// CRITICAL FIX: Equal reserves with larger values like working tests
const ammInitialQuoteAssetAmount = new BN(1000).mul(BASE_PRECISION);
const ammInitialBaseAssetAmount = new BN(1000).mul(BASE_PRECISION); // EQUAL!

// YOUR WORKING ORACLES
const MARKETS = [
  {
    symbol: 'SOL',
    index: 0,
    oracle: new PublicKey("CAXyA9sH9vHdWYb2zY7AdK5gydSRRo2Z2Nzrfns9PFZi"),
    pegMultiplier: PEG_PRECISION // Start with 1.0 like working tests
  }
];

async function main() {
  console.log("🎯 FORCE CREATING MARKETS - AdminClient with full params");
  
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

  const bulkAccountLoader = new BulkAccountLoader(provider.connection, 'confirmed', 1000);
  
  // Try AdminClient instead
  const adminClient = new AdminClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [0],
    spotMarketIndexes: [0],
    subAccountIds: [],
    accountSubscription: {
      type: 'polling',
      accountLoader: bulkAccountLoader,
    },
  });

  try {
    await adminClient.subscribe();
    
    const state = adminClient.getStateAccount();
    console.log(`Current markets: ${state.numberOfMarkets} perp, ${state.numberOfSpotMarkets} spot`);

    console.log(`\nEqual reserves: ${ammInitialBaseAssetAmount.eq(ammInitialQuoteAssetAmount)}`);
    console.log(`Values: ${ammInitialBaseAssetAmount.toString()}`);

    const periodicity = new BN(3600);

    for (const market of MARKETS) {
      console.log(`\n🏪 Creating ${market.symbol} with FULL PARAMETERS`);
      console.log(`Oracle: ${market.oracle.toBase58()}`);

      try {
        // Use FULL AdminClient signature 
        const txSig = await adminClient.initializePerpMarket(
          market.index,                              // marketIndex
          market.oracle,                             // priceOracle
          ammInitialBaseAssetAmount,                 // baseAssetReserve - EQUAL
          ammInitialQuoteAssetAmount,                // quoteAssetReserve - EQUAL
          periodicity,                               // periodicity
          market.pegMultiplier,                      // pegMultiplier
          OracleSource.PythLazer,                    // oracleSource
          ContractTier.A,                            // contractTier
          2000,                                      // marginRatioInitial
          500,                                       // marginRatioMaintenance
          0,                                         // liquidatorFee
          10000,                                     // ifLiquidatorFee
          0,                                         // imfFactor
          true,                                      // activeStatus
          0,                                         // baseSpread
          142500,                                    // maxSpread
          ZERO,                                      // maxOpenInterest
          ZERO,                                      // maxRevenueWithdrawPerPeriod
          ZERO,                                      // quoteMaxInsurance
          BASE_PRECISION.divn(10000),                // orderStepSize
          PRICE_PRECISION.divn(100000),              // orderTickSize
          BASE_PRECISION.divn(10000),                // minOrderSize
          ONE,                                       // concentrationCoefScale
          0,                                         // curveUpdateIntensity
          0,                                         // ammJitIntensity
          `${market.symbol}-PERP`                    // name
        );

        console.log(`✅ ${market.symbol} CREATED! TX: ${txSig}`);
        
        // Verify immediately
        await adminClient.fetchAccounts();
        const perpMarket = adminClient.getPerpMarketAccount(market.index);
        if (perpMarket) {
          console.log(`✅ ${market.symbol} VERIFIED - Oracle: ${perpMarket.amm.oracle.toBase58()}`);
          console.log(`✅ Equal reserves: ${perpMarket.amm.baseAssetReserve.eq(perpMarket.amm.quoteAssetReserve)}`);
          console.log("🎯 MARKET IS SET UP!");
        }

      } catch (error) {
        console.log(`❌ ${market.symbol} Error: ${error.message}`);
        
        if (error.message.includes('already initialized') || 
            error.message.includes('already exists')) {
          console.log(`✅ ${market.symbol} already exists!`);
          
          try {
            await adminClient.fetchAccounts();
            const perpMarket = adminClient.getPerpMarketAccount(market.index);
            if (perpMarket) {
              console.log(`✅ Existing ${market.symbol} verified`);
              console.log("🎯 MARKET IS SET UP!");
            }
          } catch (verifyError) {
            console.log("Could not verify existing market");
          }
        }
      }
    }

  } catch (error) {
    console.log("❌ Fatal error:", error.message);
    console.log("Stack:", error.stack);
  } finally {
    try {
      await adminClient.unsubscribe();
    } catch (err) {}
  }
}

main().catch(console.error); 