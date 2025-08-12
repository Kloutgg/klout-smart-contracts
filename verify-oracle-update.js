const { Connection, PublicKey } = require('@solana/web3.js');
const { DriftClient, BulkAccountLoader, Wallet } = require('@drift-labs/sdk');

async function verifyOracleUpdate() {
  const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=ca49b73e-00a4-42d0-8e60-ad1a01e3dc97');
  
  // Dummy wallet for read-only operations
  const wallet = {
    publicKey: new PublicKey('11111111111111111111111111111111'),
    signTransaction: () => { throw new Error('Read-only'); },
    signAllTransactions: () => { throw new Error('Read-only'); }
  };
  
  const driftClient = new DriftClient({
    connection,
    wallet: wallet,
    programID: new PublicKey('7a247Z1uc66BycPHmL7xuGps2Jrym9RQngiWwgqQCtYn'),
    accountSubscription: {
      type: 'polling',
      accountLoader: new BulkAccountLoader(connection, 'confirmed', 1000),
    },
    perpMarketIndexes: [0],
    spotMarketIndexes: [0],
  });

  try {
    await driftClient.subscribe();
    await driftClient.fetchAccounts();
    
    const market = driftClient.getPerpMarketAccount(0);
    const oracleTwap = market.amm.historicalOracleData.lastOraclePriceTwap;
    const oracleTwap5Min = market.amm.historicalOracleData.lastOraclePriceTwap5Min;
    
    console.log('🔍 Current Oracle TWAP Status:');
    console.log(`📊 Oracle TWAP (1-hour, for funding): $${oracleTwap / 1000000}`);
    console.log(`📊 Oracle TWAP (5-minute): $${oracleTwap5Min / 1000000}`);
    console.log(`⏰ Last update timestamp: ${market.amm.historicalOracleData.lastOraclePriceTwapTs}`);
    
    await driftClient.unsubscribe();
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

verifyOracleUpdate();