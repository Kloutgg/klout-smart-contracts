const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { DriftClient, initialize, BN, QUOTE_PRECISION } = require('@drift-labs/sdk');
const fs = require('fs');

async function main() {
  console.log('🚰 Using Drift Token Faucet...');
  
  // Initialize SDK for devnet
  const sdkConfig = initialize({ env: 'devnet' });
  
  // Use your configured devnet RPC URL
  const rpcUrl = 'https://devnet.helius-rpc.com/?api-key=ca49b73e-00a4-42d0-8e60-ad1a01e3dc97';
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Load your keypair
  const keypairPath = '/Users/moreshkokane/Documents/code/bilc.json';
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  
  console.log(`Using wallet: ${keypair.publicKey.toString()}`);
  
  // Create wallet adapter
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
    console.log('📡 Connecting to Drift protocol...');
    await driftClient.subscribe();
    console.log('✅ Connected!');
    
    // Check if user account exists
    const userAccountPublicKey = await driftClient.getUserAccountPublicKey();
    const userAccountExists = await connection.getAccountInfo(userAccountPublicKey);
    
    if (!userAccountExists) {
      console.log('👤 User account not found. Let\'s initialize it with devnet faucet...');
      
      // Amount to get from faucet (50 USDC)
      const amount = new BN(50).mul(QUOTE_PRECISION);
      
      try {
        // This method should initialize the user account AND get USDC from the devnet faucet
        console.log('💰 Initializing user account for devnet with faucet...');
        
        const result = await driftClient.initializeUserAccountForDevnet(
          0,        // subAccountId 
          'test',   // name
          0,        // referrerInfo
          undefined, // tokenFaucet (let it use default)
          amount    // amount to get from faucet
        );
        
        console.log('✅ User account initialized with USDC from faucet!');
        console.log('Result:', result);
        
        // Wait a moment for transaction to be confirmed
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check balance
        const user = await driftClient.getUser();
        const userAccount = user.getUserAccount();
        const spotPositions = userAccount.spotPositions;
        
        for (let i = 0; i < spotPositions.length; i++) {
          const pos = spotPositions[i];
          if (pos.marketIndex === 0 && (pos.scaledBalance.gt(new BN(0)) || pos.scaledBalance.lt(new BN(0)))) {
            console.log(`💰 USDC Balance: ${pos.scaledBalance.div(QUOTE_PRECISION).toString()} USDC`);
            break;
          }
        }
        
      } catch (err) {
        console.error('❌ Error using devnet faucet:', err.message);
        console.log('\n💡 The devnet faucet method might not be available in the published SDK.');
        console.log('   You may need to manually get USDC from web faucets.');
      }
      
    } else {
      console.log('✅ User account already exists!');
      
      // Check current balance
      const user = await driftClient.getUser();
      const userAccount = user.getUserAccount();
      const spotPositions = userAccount.spotPositions;
      
      let foundUsdc = false;
      for (let i = 0; i < spotPositions.length; i++) {
        const pos = spotPositions[i];
        if (pos.marketIndex === 0 && (pos.scaledBalance.gt(new BN(0)) || pos.scaledBalance.lt(new BN(0)))) {
          console.log(`💰 Current USDC Balance: ${pos.scaledBalance.div(QUOTE_PRECISION).toString()} USDC`);
          foundUsdc = true;
          break;
        }
      }
      
      if (!foundUsdc) {
        console.log('💰 No USDC balance found. You may need to deposit some.');
      }
    }
    
    await driftClient.unsubscribe();
    console.log('\n👋 Disconnected from Drift protocol');
    
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

main().catch(console.error); 