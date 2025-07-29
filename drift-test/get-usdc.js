const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } = require('@solana/spl-token');
const fs = require('fs');

async function main() {
  console.log('💰 Getting devnet USDC...');
  
  // Use your configured devnet RPC URL
  const rpcUrl = 'https://devnet.helius-rpc.com/?api-key=35e3349e-26bd-4c88-88f3-a3d99637ae01';
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Load your keypair
  const keypairPath = '/Users/moreshkokane/Documents/code/bilc.json';
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  
  console.log(`Using wallet: ${keypair.publicKey.toString()}`);
  
  // Devnet USDC mint address (this is the standard devnet USDC)
  const devnetUsdcMint = new PublicKey('8zGuJQqwhZafTah7Uc7Z4tXRnguqkn5KLFAP8oV6PHe2');
  
  console.log('\n📋 Available options to get devnet USDC:');
  console.log('1. Use Solana web faucet (manual)');
  console.log('2. Try the Drift token faucet program');
  console.log('3. Use spl-token CLI (if available)');
  
  // Check if you already have a USDC token account
  try {
    const associatedTokenAccount = await getAssociatedTokenAddress(
      devnetUsdcMint,
      keypair.publicKey
    );
    
    console.log(`\n🏦 Your USDC token account: ${associatedTokenAccount.toString()}`);
    
    const accountInfo = await connection.getAccountInfo(associatedTokenAccount);
    
    if (!accountInfo) {
      console.log('📝 Creating USDC token account...');
      
      // Create associated token account
      const transaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          keypair.publicKey,
          associatedTokenAccount,
          keypair.publicKey,
          devnetUsdcMint
        )
      );
      
      const signature = await connection.sendTransaction(transaction, [keypair]);
      await connection.confirmTransaction(signature);
      
      console.log('✅ USDC token account created!');
      console.log(`Transaction: ${signature}`);
    } else {
      console.log('✅ USDC token account already exists');
      
      // Check current balance
      const tokenAccount = await connection.getTokenAccountBalance(associatedTokenAccount);
      console.log(`Current USDC balance: ${tokenAccount.value.uiAmount || 0} USDC`);
    }
    
    console.log('\n🌐 Manual options:');
    console.log('1. Visit: https://faucet.solana.com/');
    console.log('   - Select "Devnet"');
    console.log('   - Choose "USDC" token');
    console.log(`   - Enter your wallet address: ${keypair.publicKey.toString()}`);
    
    console.log('\n2. Or use spl-token CLI:');
    console.log(`   solana config set --url https://api.devnet.solana.com`);
    console.log(`   spl-token create-account ${devnetUsdcMint.toString()}`);
    console.log(`   spl-token mint ${devnetUsdcMint.toString()} 100 ${associatedTokenAccount.toString()}`);
    
    console.log('\n3. Or try Drift\'s token faucet:');
    await tryDriftTokenFaucet(connection, keypair, devnetUsdcMint, associatedTokenAccount);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

async function tryDriftTokenFaucet(connection, keypair, usdcMint, _tokenAccount) {
  try {
    console.log('🚰 Attempting to use Drift token faucet...');
    
    // This is the token faucet program ID from Anchor.toml
    const tokenFaucetProgramId = new PublicKey('5mnk7fV1JRfsr2jqVCb8yrw4mKByEQcJkGXRUXguc1TE');
    
    // Try to find the faucet account for USDC
    const [faucetAccount] = await PublicKey.findProgramAddress(
      [Buffer.from('faucet'), usdcMint.toBuffer()],
      tokenFaucetProgramId
    );
    
    console.log(`Faucet account: ${faucetAccount.toString()}`);
    
    // Check if faucet exists
    const faucetInfo = await connection.getAccountInfo(faucetAccount);
    
    if (faucetInfo) {
      console.log('✅ Token faucet found! You can potentially use this.');
      console.log('💡 The faucet program exists but would need specific instructions to use it.');
      console.log('   This would typically require calling the faucet program with the right parameters.');
    } else {
      console.log('❌ Token faucet not found for USDC');
    }
    
  } catch (err) {
    console.log('❌ Could not access token faucet:', err.message);
  }
}

main().catch(console.error); 