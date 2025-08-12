const { Connection, PublicKey } = require('@solana/web3.js');
const { DriftClient, BulkAccountLoader } = require('klout-labs-sdk');
const { AnchorProvider, Wallet } = require('@coral-xyz/anchor');

async function checkMarketExists() {
  const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=ca49b73e-00a4-42d0-8e60-ad1a01e3dc97');
  
  // Create a dummy provider
  const wallet = new Wallet({
    publicKey: new PublicKey('11111111111111111111111111111111'),
    signTransaction: () => { throw new Error('Not implemented'); },
    signAllTransactions: () => { throw new Error('Not implemented'); }
  });
  
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  
  const driftClient = new DriftClient({
    connection,
    wallet: provider.wallet,
    programID: new PublicKey('BdptEft1JJL7XVTf2BFTVvMKGcLDsukzpcpmZm3TpAur'),
    accountSubscription: {
      type: 'polling',
      accountLoader: new BulkAccountLoader(connection, 'confirmed', 1000),
    },
  });

  try {
    await driftClient.subscribe();
    await driftClient.fetchAccounts();
    
    const state = driftClient.getStateAccount();
    console.log(`Total perp markets: ${state.numberOfMarkets}`);
    
    // Check market index 0
    try {
      const perpMarket = driftClient.getPerpMarketAccount(0);
      if (perpMarket) {
        console.log(`✅ Market index 0 EXISTS`);
        console.log(`   Oracle: ${perpMarket.amm.oracle.toBase58()}`);
        console.log(`   Status: ${perpMarket.status}`);
        console.log(`   Oracle Source: ${perpMarket.amm.oracleSource}`);
      }
    } catch (error) {
      console.log(`❌ Market index 0 DOES NOT EXIST: ${error.message}`);
      console.log(`\n🔧 You need to create the perp market first!`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkMarketExists().catch(console.error);