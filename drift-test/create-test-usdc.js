const { Connection, Keypair } = require('@solana/web3.js');
const { 
  createMint, 
  createAssociatedTokenAccountIdempotent, 
  mintTo
} = require('@solana/spl-token');
const fs = require('fs');

async function main() {
  console.log('🪙 Creating test USDC mint for development...');
  
  // Use your configured devnet RPC URL
  const rpcUrl = 'https://devnet.helius-rpc.com/?api-key=35e3349e-26bd-4c88-88f3-a3d99637ae01';
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Load your keypair
  const keypairPath = '/Users/moreshkokane/Documents/code/bilc.json';
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(new Uint8Array(keypairData));
  
  console.log(`Using wallet: ${payer.publicKey.toString()}`);
  
  try {
    // Create a new USDC-like mint with 6 decimals
    console.log('🏭 Creating test USDC mint...');
    const mint = await createMint(
      connection,
      payer,           // payer
      payer.publicKey, // mint authority
      payer.publicKey, // freeze authority
      6                // decimals (USDC has 6 decimals)
    );
    
    console.log(`✅ Test USDC mint created: ${mint.toString()}`);
    
    // Create associated token account for your wallet
    console.log('🏦 Creating token account...');
    const tokenAccount = await createAssociatedTokenAccountIdempotent(
      connection,
      payer,           // payer
      mint,            // mint
      payer.publicKey  // owner
    );
    
    console.log(`✅ Token account created: ${tokenAccount.toString()}`);
    
    // Mint 1000 test USDC to your account
    console.log('💰 Minting 1000 test USDC...');
    const mintAmount = 1000 * 10**6; // 1000 USDC with 6 decimals
    
    await mintTo(
      connection,
      payer,           // payer
      mint,            // mint
      tokenAccount,    // destination
      payer.publicKey, // authority
      mintAmount       // amount
    );
    
    console.log(`✅ Minted ${mintAmount / 10**6} test USDC tokens!`);
    
    // Check balance
    const balance = await connection.getTokenAccountBalance(tokenAccount);
    console.log(`💰 Token account balance: ${balance.value.uiAmount} test USDC`);
    
    console.log('\n📋 Summary:');
    console.log(`Test USDC Mint: ${mint.toString()}`);
    console.log(`Your Token Account: ${tokenAccount.toString()}`);
    console.log(`Balance: ${balance.value.uiAmount} test USDC`);
    
    console.log('\n💡 Now you can use this test USDC to test trading!');
    console.log('   You can modify the Drift config to use this mint for testing.');
    
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

main().catch(console.error); 