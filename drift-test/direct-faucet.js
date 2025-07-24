const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const { initialize } = require('@drift-labs/sdk');
const fs = require('fs');

async function main() {
  console.log('🚰 Trying direct token faucet interaction...');
  
  // Initialize SDK for devnet
  const sdkConfig = initialize({ env: 'devnet' });
  
  // Use your configured devnet RPC URL
  const rpcUrl = 'https://devnet.helius-rpc.com/?api-key=35e3349e-26bd-4c88-88f3-a3d99637ae01';
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Load your keypair
  const keypairPath = '/Users/moreshkokane/Documents/code/bilc.json';
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  
  console.log(`Using wallet: ${keypair.publicKey.toString()}`);
  
  // Token faucet program ID from Anchor.toml
  const tokenFaucetProgramId = new PublicKey('V4v1mQiAdLz4qwckEb45WqHYceYizoib39cDBHSWfaB');
  
  // USDC mint address from Drift config
  const usdcMint = new PublicKey(sdkConfig.USDC_MINT_ADDRESS);
  console.log(`USDC mint: ${usdcMint.toString()}`);
  
  try {
    // Find the faucet config PDA
    const [faucetConfig] = await PublicKey.findProgramAddress(
      [Buffer.from('faucet_config'), usdcMint.toBuffer()],
      tokenFaucetProgramId
    );
    
    console.log(`Faucet config PDA: ${faucetConfig.toString()}`);
    
    // Check if faucet config exists
    const faucetConfigInfo = await connection.getAccountInfo(faucetConfig);
    
    if (!faucetConfigInfo) {
      console.log('❌ Token faucet not initialized for this USDC mint');
      console.log('💡 This means the faucet isn\'t set up for the devnet USDC mint');
      
      // List what we tried
      console.log('\n📋 What we checked:');
      console.log(`- Token Faucet Program: ${tokenFaucetProgramId.toString()}`);
      console.log(`- USDC Mint: ${usdcMint.toString()}`);
      console.log(`- Faucet Config PDA: ${faucetConfig.toString()}`);
      
      return;
    }
    
    console.log('✅ Faucet config found!');
    
    // Get your USDC token account
    const userTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      keypair.publicKey
    );
    
    console.log(`Your USDC token account: ${userTokenAccount.toString()}`);
    
    // Check if token account exists
    const tokenAccountInfo = await connection.getAccountInfo(userTokenAccount);
    if (!tokenAccountInfo) {
      console.log('❌ USDC token account not found. Please create it first.');
      return;
    }
    
    // Try to read the faucet config to get mint authority
    console.log('📖 Reading faucet config...');
    
    // The faucet config contains: admin, mint, mint_authority, mint_authority_nonce
    // Let's try to decode it (this is a simplified approach)
    const configData = faucetConfigInfo.data;
    console.log(`Config data length: ${configData.length}`);
    
    if (configData.length >= 104) { // Expected size for FaucetConfig
      // Try to extract mint authority (this is approximate)
      const mintAuthorityBytes = configData.slice(72, 104); // Approximate location
      const mintAuthority = new PublicKey(mintAuthorityBytes);
      
      console.log(`Extracted mint authority: ${mintAuthority.toString()}`);
      
      console.log('\n💡 The token faucet exists but requires proper instruction building.');
      console.log('   This would need the full Anchor program interface to work properly.');
    }
    
    console.log('\n📋 Summary:');
    console.log('✅ Token faucet program exists');
    console.log('✅ Faucet config is initialized');
    console.log('❌ Need proper instruction building to use it');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

main().catch(console.error); 