const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { 
  TestClient,
  BulkAccountLoader,
  Wallet,
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");

async function main() {
  console.log("🔍 CHECKING EXISTING MARKETS");
  console.log("=".repeat(40));
  
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );

  const provider = new anchor.AnchorProvider(
    new Connection(DEVNET_RPC, 'confirmed'),
    new Wallet(keypair),
    { commitment: 'confirmed' }
  );

  // Create client with all possible market indices
  const driftClient = new TestClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [0, 1, 2, 3, 4, 5], // Check first 6 indices
    spotMarketIndexes: [0],
    oracleInfos: [],
    accountSubscription: {
      type: 'polling',
      accountLoader: new BulkAccountLoader(provider.connection, 'confirmed', 0),
    },
  });

  try {
    await driftClient.subscribe();
    await driftClient.fetchAccounts();
    
    const state = driftClient.getStateAccount();
    console.log(`State: ${state.numberOfMarkets} perp markets, ${state.numberOfSpotMarkets} spot markets\n`);

    // Check each market index
    for (let i = 0; i < 6; i++) {
      try {
        const market = driftClient.getPerpMarketAccount(i);
        if (market) {
          console.log(`📊 Market Index ${i}:`);
          console.log(`   Oracle: ${market.amm.oracle.toBase58()}`);
          console.log(`   Oracle Source: ${JSON.stringify(market.amm.oracleSource)}`);
          console.log(`   Oracle Slot Delay Override: ${market.amm.oracleSlotDelayOverride}`);
          console.log(`   Base Spread: ${market.amm.baseSpread} (${market.amm.baseSpread/10000}%)`);
          console.log(`   Status: ${market.status ? 'Active' : 'Inactive'}`);
          console.log('');
        }
      } catch (error) {
        console.log(`❌ Market Index ${i}: Not found or error`);
      }
    }

    console.log("💡 Next available market index appears to be:", state.numberOfMarkets);

    await driftClient.unsubscribe();
    
  } catch (error) {
    console.log("❌ Error:", error.message);
  }
}

main().catch(console.error); 