const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { DriftClient, initialize } = require('@drift-labs/sdk');
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => {
    rl.question(query, resolve);
  });
}

async function main() {
  // Initialize SDK for devnet
  const sdkConfig = initialize({ env: 'devnet' });
  
  console.log('Connecting to Drift protocol on devnet...');
  console.log('Program ID:', sdkConfig.DRIFT_PROGRAM_ID);
  
  // Use your configured devnet RPC URL
  const rpcUrl = 'https://devnet.helius-rpc.com/?api-key=ca49b73e-00a4-42d0-8e60-ad1a01e3dc97';
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Load your keypair from the correct path
  const keypairPath = '/Users/moreshkokane/Documents/code/bilc.json';
  console.log(`Loading keypair from: ${keypairPath}`);
  
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  
  console.log(`Using wallet: ${keypair.publicKey.toString()}`);
  
  // Create a proper wallet implementation
  const wallet = {
    publicKey: keypair.publicKey,
    signTransaction: async (tx) => {
      tx.sign(keypair);
      return tx;
    },
    signAllTransactions: async (txs) => {
      return txs.map(tx => {
        tx.sign(keypair);
        return tx;
      });
    },
    payer: keypair
  };
  
  // Initialize Drift client
  const driftClient = new DriftClient({
    connection,
    wallet,
    programID: new PublicKey(sdkConfig.DRIFT_PROGRAM_ID),
    env: 'devnet',
  });
  
  try {
    console.log('Subscribing to Drift client...');
    await driftClient.subscribe();
    console.log('Connected to Drift protocol!');
    
    // List available markets
    console.log('\nAvailable Perpetual Markets:');
    const perpMarkets = sdkConfig.PERP_MARKETS;
    perpMarkets.forEach(market => {
      console.log(`Market ${market.marketIndex}: ${market.symbol} (${market.baseAssetSymbol})`);
    });
    
    console.log('\nAvailable Spot Markets:');
    const spotMarkets = sdkConfig.SPOT_MARKETS;
    spotMarkets.forEach(market => {
      console.log(`Market ${market.marketIndex}: ${market.symbol}`);
    });
    
    // Check if user account exists by trying to get the user account public key directly
    try {
      // Calculate the user account PDA without requiring the user to exist
      const [userAccountPublicKey] = await PublicKey.findProgramAddress(
        [
          Buffer.from('user', 'utf-8'),
          keypair.publicKey.toBuffer(),
          new Uint8Array([0, 0]) // subAccountId 0
        ],
        driftClient.program.programId
      );
      
      console.log('\nCalculated user account address:', userAccountPublicKey.toString());
    
      const userAccountInfo = await connection.getAccountInfo(userAccountPublicKey);
      const userAccountExists = userAccountInfo !== null;
      console.log('User account exists:', userAccountExists);
      
      if (!userAccountExists) {
        console.log('\nYou need to initialize a user account to interact with Drift.');
        const answer = await question('Would you like to initialize a user account now? (y/n): ');
    
        if (answer.toLowerCase() === 'y') {
          console.log('\nInitializing user account...');
          try {
            // Initialize user account with proper error handling
            const tx = await driftClient.initializeUserAccount(0);
            console.log('User account initialized! Transaction signature:', tx);
            
            // Wait a bit for the transaction to be confirmed
            console.log('Waiting for transaction confirmation...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Try to get user account again
            const userAccountInfo = await connection.getAccountInfo(userAccountPublicKey);
            console.log('User account now exists:', userAccountInfo !== null);
          } catch (err) {
            console.error('Error initializing user account:', err);
            if (err.logs) {
              console.error('Transaction logs:');
              err.logs.forEach(log => console.error(log));
            }
          }
        }
      } else {
        // User account exists, try to get more information
      try {
        const user = await driftClient.getUser();
        console.log('\nUser Information:');
        console.log('Sub account ID:', user.getUserAccount().subAccountId);
        console.log('Margin trading enabled:', user.getUserAccount().marginTradingEnabled);
        
        // Try to get positions
        const perpPositions = user.getPerpPositionsWithMetadata();
        if (perpPositions.length > 0) {
          console.log('\nPerpetual Positions:');
          perpPositions.forEach(pos => {
            console.log(`Market ${pos.marketIndex}: Base Asset Amount: ${pos.baseAssetAmount.toString()}, Quote Asset Amount: ${pos.quoteAssetAmount.toString()}`);
          });
        } else {
          console.log('\nNo perpetual positions found.');
        }
        
        // Try to get deposits
        const spotPositions = user.getTokenPositionsWithMetadata();
        if (spotPositions.length > 0) {
          console.log('\nSpot Positions:');
          spotPositions.forEach(pos => {
            console.log(`Market ${pos.marketIndex}: Token Amount: ${pos.tokenAmount.toString()}`);
          });
        } else {
          console.log('\nNo spot positions found.');
        }
      } catch (err) {
        console.error('Error fetching user details:', err.message);
      }
      }
    } catch (err) {
      console.error('Error checking user account:', err.message);
    }
    
    await driftClient.unsubscribe();
    console.log('\nDone!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    rl.close();
  }
}

main().catch(console.error);