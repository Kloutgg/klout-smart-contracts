const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const { DriftClient, initialize, BN, QUOTE_PRECISION } = require('@drift-labs/sdk');
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
  console.log('💰 Depositing USDC into Drift as collateral...');
  
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
    
    // Get USDC token account
    const usdcMint = new PublicKey(sdkConfig.USDC_MINT_ADDRESS);
    const userTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      keypair.publicKey
    );
    
    console.log(`USDC token account: ${userTokenAccount.toString()}`);
    
    // Check current USDC balance in token account
    const tokenBalance = await connection.getTokenAccountBalance(userTokenAccount);
    const availableUsdc = tokenBalance.value.uiAmount || 0;
    
    console.log(`💰 Available USDC in token account: ${availableUsdc} USDC`);
    
    if (availableUsdc === 0) {
      console.log('❌ No USDC found in token account. Please get USDC first.');
      await driftClient.unsubscribe();
      rl.close();
      return;
    }
    
    // Ask how much to deposit
    const depositAmount = await question(`How much USDC to deposit into Drift? (max ${availableUsdc}): `);
    const depositAmountNum = parseFloat(depositAmount);
    
    if (isNaN(depositAmountNum) || depositAmountNum <= 0 || depositAmountNum > availableUsdc) {
      console.log('❌ Invalid deposit amount');
      await driftClient.unsubscribe();
      rl.close();
      return;
    }
    
    // Convert to proper precision
    const depositAmountBN = new BN(depositAmountNum * 10**6); // USDC has 6 decimals
    
    console.log(`\n📋 Deposit Details:`);
    console.log(`Amount: ${depositAmountNum} USDC`);
    console.log(`From: ${userTokenAccount.toString()}`);
    console.log(`To: Drift Protocol (Spot Market 0)`);
    
    const confirm = await question('\n🤔 Confirm deposit? (y/n): ');
    
    if (confirm.toLowerCase() === 'y') {
      console.log('\n⏳ Depositing USDC...');
      
      try {
        // Deposit into spot market 0 (USDC)
        const txSig = await driftClient.deposit(
          depositAmountBN,
          0, // USDC is spot market index 0
          userTokenAccount
        );
        
        console.log('✅ Deposit successful!');
        console.log(`📝 Transaction signature: ${txSig}`);
        console.log(`🔗 View on explorer: https://explorer.solana.com/tx/${txSig}?cluster=devnet`);
        
        // Wait for confirmation
        console.log('\n⏳ Waiting for confirmation...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check Drift balance
        console.log('\n📊 Updated Drift Account Status:');
        const user = await driftClient.getUser();
        const userAccount = user.getUserAccount();
        const spotPositions = userAccount.spotPositions;
        
        for (let i = 0; i < spotPositions.length; i++) {
          const pos = spotPositions[i];
          if (pos.marketIndex === 0 && (pos.scaledBalance.gt(new BN(0)) || pos.scaledBalance.lt(new BN(0)))) {
            const balance = pos.scaledBalance.div(QUOTE_PRECISION);
            console.log(`💰 Drift USDC Balance: ${balance.toString()} USDC`);
            break;
          }
        }
        
        console.log('\n🎉 You can now trade on Drift!');
        
      } catch (err) {
        console.error('❌ Deposit failed:', err.message);
        if (err.logs) {
          console.error('Transaction logs:', err.logs);
        }
      }
    } else {
      console.log('Deposit cancelled.');
    }
    
    await driftClient.unsubscribe();
    rl.close();
    console.log('\n👋 Disconnected from Drift protocol');
    
  } catch (err) {
    console.error('❌ Error:', err);
    await driftClient.unsubscribe();
    rl.close();
  }
}

main().catch(console.error); 