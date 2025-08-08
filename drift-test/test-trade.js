const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { 
  DriftClient, 
  initialize, 
  BN, 
  BASE_PRECISION, 
  QUOTE_PRECISION,
  getMarketOrderParams,
  PositionDirection,
  User
} = require('@drift-labs/sdk');
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
  
  console.log('🚀 Setting up test trade on Drift Protocol (devnet)...');
  console.log('Program ID:', sdkConfig.DRIFT_PROGRAM_ID);
  
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
    
    // Initialize user
    let user;
    try {
      user = new User({
        driftClient,
        userAccountPublicKey: await driftClient.getUserAccountPublicKey(),
      });
      
      await user.subscribe();
      console.log('👤 User subscribed');
    } catch (userErr) {
      console.error('❌ Error initializing user:', userErr.message);
      await cleanup(driftClient, null);
      return;
    }
    
    // Check current positions and balances
    console.log('\n📊 Current Account Status:');
    
    const userAccount = user.getUserAccount();
    const spotPositions = userAccount.spotPositions;
    let usdcBalance = new BN(0);
    
    console.log('💰 Spot Positions:');
    let hasSpotPositions = false;
    for (let i = 0; i < spotPositions.length; i++) {
      const pos = spotPositions[i];
      if (pos.scaledBalance.gt(new BN(0)) || pos.scaledBalance.lt(new BN(0))) {
        hasSpotPositions = true;
        console.log(`  - Market ${pos.marketIndex}: ${pos.scaledBalance.toString()} (scaled)`);
        if (pos.marketIndex === 0) { // USDC
          usdcBalance = pos.scaledBalance;
        }
      }
    }
    if (!hasSpotPositions) {
      console.log('  No spot positions found');
    }
    
    const perpPositions = userAccount.perpPositions;
    console.log('📈 Perpetual Positions:');
    let hasPerpPositions = false;
    for (let i = 0; i < perpPositions.length; i++) {
      const pos = perpPositions[i];
      if (pos.baseAssetAmount.gt(new BN(0)) || pos.baseAssetAmount.lt(new BN(0))) {
        hasPerpPositions = true;
        const baseAmount = pos.baseAssetAmount.div(BASE_PRECISION);
        console.log(`  - Market ${pos.marketIndex}: ${baseAmount.toString()} base`);
      }
    }
    if (!hasPerpPositions) {
      console.log('  No perpetual positions found');
    }
    
    // Check if we have enough collateral for trading
    const minRequiredUsdc = new BN(10).mul(QUOTE_PRECISION); // 10 USDC minimum
    
    if (usdcBalance.lt(minRequiredUsdc)) {
      console.log('\n⚠️  Insufficient USDC collateral for trading');
      console.log(`Current USDC: ${usdcBalance.div(QUOTE_PRECISION).toString()}`);
      console.log(`Required: ${minRequiredUsdc.div(QUOTE_PRECISION).toString()}`);
      console.log('\n💡 To get test USDC on devnet, you can:');
      console.log('   1. Use a devnet USDC faucet');
      console.log('   2. Use the Drift devnet deposit function');
      console.log('   3. Swap some SOL for USDC on a devnet DEX');
      
      const proceed = await question('\nDo you want to continue anyway? (y/n): ');
      if (proceed.toLowerCase() !== 'y') {
        console.log('Trade cancelled.');
        await cleanup(driftClient, user);
        return;
      }
    }
    
    // Get SOL-PERP market info
    const solPerpMarketIndex = 0;
    const solPerpMarket = driftClient.getPerpMarketAccount(solPerpMarketIndex);
    const oracleData = driftClient.getOracleDataForPerpMarket(solPerpMarketIndex);
    
    console.log(`\n🎯 SOL-PERP Market Info:`);
    console.log(`   Market Index: ${solPerpMarket.marketIndex}`);
    console.log(`   Oracle Price: $${oracleData.price.div(QUOTE_PRECISION).toString()}`);
    
    // Prepare trade parameters
    const tradeSize = BASE_PRECISION.div(new BN(100)); // 0.01 SOL = BASE_PRECISION / 100
    const direction = PositionDirection.LONG;
    
    console.log(`\n📋 Trade Details:`);
    console.log(`   Market: SOL-PERP (${solPerpMarketIndex})`);
    console.log(`   Size: ${tradeSize.div(BASE_PRECISION).toString()} SOL (${tradeSize.toString()} base units)`);
    console.log(`   Direction: ${direction === PositionDirection.LONG ? 'LONG' : 'SHORT'}`);
    console.log(`   Type: Market Order`);
    
    const confirm = await question('\n🤔 Confirm this trade? (y/n): ');
    
    if (confirm.toLowerCase() === 'y') {
      console.log('\n⏳ Placing order...');
      
      try {
        const orderParams = getMarketOrderParams({
          baseAssetAmount: tradeSize,
          direction: direction,
          marketIndex: solPerpMarketIndex,
        });
        
        const txSig = await driftClient.placePerpOrder(orderParams);
        console.log('✅ Order placed successfully!');
        console.log(`📝 Transaction signature: ${txSig}`);
        console.log(`🔗 View on explorer: https://explorer.solana.com/tx/${txSig}?cluster=devnet`);
        
        // Wait a moment and check the position
        console.log('\n⏳ Waiting for order to fill...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Refresh user data
        await user.fetchAccounts();
        
        const updatedUserAccount = user.getUserAccount();
        const updatedPerpPositions = updatedUserAccount.perpPositions;
        console.log('\n📊 Updated Positions:');
        
        let hasUpdatedPositions = false;
        for (let i = 0; i < updatedPerpPositions.length; i++) {
          const pos = updatedPerpPositions[i];
          if (pos.baseAssetAmount.gt(new BN(0)) || pos.baseAssetAmount.lt(new BN(0))) {
            hasUpdatedPositions = true;
            const baseAmount = pos.baseAssetAmount.div(BASE_PRECISION);
            const quoteAmount = pos.quoteAssetAmount.div(QUOTE_PRECISION);
            console.log(`  - Market ${pos.marketIndex}:`);
            console.log(`    Base: ${baseAmount.toString()}`);
            console.log(`    Quote: ${quoteAmount.toString()}`);
          }
        }
        if (!hasUpdatedPositions) {
          console.log('  No positions found (order might still be processing)');
        }
        
      } catch (err) {
        console.error('❌ Error placing order:', err.message);
        if (err.logs) {
          console.error('Transaction logs:', err.logs);
        }
      }
    } else {
      console.log('Trade cancelled.');
    }
    
    await cleanup(driftClient, user);
    
  } catch (err) {
    console.error('❌ Error:', err);
    await cleanup(driftClient, null);
  }
}

async function cleanup(driftClient, user) {
  try {
    if (user) await user.unsubscribe();
    if (driftClient) await driftClient.unsubscribe();
    rl.close();
    console.log('\n👋 Disconnected from Drift protocol');
  } catch (err) {
    console.error('Error during cleanup:', err);
  }
}

main().catch(console.error); 