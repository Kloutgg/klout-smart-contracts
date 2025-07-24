const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const { initialize } = require('@drift-labs/sdk');
const fs = require('fs');

async function main() {
  console.log('💰 Checking USDC setup...');
  
  // Initialize SDK to get the correct USDC mint
  const sdkConfig = initialize({ env: 'devnet' });
  
  // Use your configured devnet RPC URL
  const rpcUrl = 'https://devnet.helius-rpc.com/?api-key=35e3349e-26bd-4c88-88f3-a3d99637ae01';
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Load your keypair
  const keypairPath = '/Users/moreshkokane/Documents/code/bilc.json';
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  
  console.log(`Using wallet: ${keypair.publicKey.toString()}`);
  
  // Get the USDC mint from Drift config and convert to PublicKey
  const usdcMintAddress = sdkConfig.USDC_MINT_ADDRESS;
  const usdcMint = new PublicKey(usdcMintAddress);
  console.log(`\n🏦 Drift USDC mint address: ${usdcMint.toString()}`);
  
  try {
    const associatedTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      keypair.publicKey
    );
    
    console.log(`Your USDC token account: ${associatedTokenAccount.toString()}`);
    
    // Check current balance
    try {
      const tokenAccount = await connection.getTokenAccountBalance(associatedTokenAccount);
      console.log(`Current USDC balance: ${tokenAccount.value.uiAmount || 0} USDC`);
      
      if (tokenAccount.value.uiAmount > 0) {
        console.log('✅ You have USDC! You can now run the test trade.');
      } else {
        console.log('⚠️  No USDC found. Try the web faucet.');
      }
    } catch (err) {
      console.log('❌ Token account not found or has no balance');
    }
    
    console.log('\n🌐 To get devnet USDC:');
    console.log('1. Visit: https://faucet.solana.com/');
    console.log('   - Select "Devnet"');
    console.log('   - Choose "USDC" token');
    console.log(`   - Enter your wallet address: ${keypair.publicKey.toString()}`);
    console.log('   - Request tokens');
    
    console.log('\n2. Alternative devnet faucets:');
    console.log('   - https://solfaucet.com/ (select devnet)');
    console.log('   - https://faucet.triangleplatform.com/solana/devnet');
    
    console.log('\n3. You can also try using a different devnet USDC faucet specifically for this mint:');
    console.log('   - Some DeFi protocols have their own USDC faucets for devnet testing');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

main().catch(console.error); 