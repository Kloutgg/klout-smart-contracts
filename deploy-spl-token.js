const { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY
} = require('@solana/web3.js');

const {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getMintLen
} = require('@solana/spl-token');

const fs = require('fs');

async function main() {
  console.log('🪙 Deploying SPL Token with:');
  console.log('  - Symbol: USDC');
  console.log('  - Decimals: 6');
  console.log('  - Supply: 1,000,000,000 (1B)');
  console.log('');

  // Connect to devnet
  const rpcUrl = 'https://devnet.helius-rpc.com/?api-key=ca49b73e-00a4-42d0-8e60-ad1a01e3dc97';
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Load your keypair (mint authority and destination)
  const keypairPath = '/Users/moreshkokane/Documents/code/bilc.json';
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(new Uint8Array(keypairData));
  
  console.log(`🔑 Using wallet: ${payer.publicKey.toString()}`);
  
  // Generate a new keypair for the mint
  const mintKeypair = Keypair.generate();
  console.log(`🏭 Mint address: ${mintKeypair.publicKey.toString()}`);
  
  // Token configuration
  const decimals = 6;
  const supply = 1000000000; // 1 billion tokens
  const mintAmount = supply * Math.pow(10, decimals); // Convert to smallest unit
  
  console.log(`💰 Will mint ${supply.toLocaleString()} tokens (${mintAmount.toLocaleString()} base units)`);
  
  try {
    // Get minimum lamports for mint account
    const mintLen = getMintLen([]);
    const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);
    
    console.log('🏗️  Creating mint account...');
    
    // Create mint account instruction
    const createMintAccountInstruction = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_PROGRAM_ID,
    });
    
    // Initialize mint instruction
    const initializeMintInstruction = createInitializeMintInstruction(
      mintKeypair.publicKey, // mint
      decimals, // decimals
      payer.publicKey, // mint authority
      payer.publicKey // freeze authority (optional, using same as mint authority)
    );
    
    // Get associated token account for the payer
    const associatedTokenAccount = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      payer.publicKey
    );
    
    console.log(`🏦 Associated token account: ${associatedTokenAccount.toString()}`);
    
    // Create associated token account instruction
    const createATAInstruction = createAssociatedTokenAccountInstruction(
      payer.publicKey, // payer
      associatedTokenAccount, // ata
      payer.publicKey, // owner
      mintKeypair.publicKey // mint
    );
    
    // Mint tokens instruction
    const mintToInstruction = createMintToInstruction(
      mintKeypair.publicKey, // mint
      associatedTokenAccount, // destination
      payer.publicKey, // authority
      mintAmount // amount
    );
    
    // Build transaction
    const transaction = new Transaction().add(
      createMintAccountInstruction,
      initializeMintInstruction,
      createATAInstruction,
      mintToInstruction
    );
    
    transaction.feePayer = payer.publicKey;
    
    console.log('🚀 Sending transaction...');
    
    // Send transaction
    const signature = await connection.sendTransaction(
      transaction, 
      [payer, mintKeypair], // signers
      { skipPreflight: false, preflightCommitment: 'confirmed' }
    );
    
    console.log('✅ Transaction sent! Signature:', signature);
    console.log(`🔗 View on explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    
    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      console.error('❌ Transaction failed:', confirmation.value.err);
      return;
    }
    
    console.log('✅ Transaction confirmed!');
    
    // Verify the mint and token account
    console.log('\n📊 Verification:');
    
    const mintInfo = await connection.getParsedAccountInfo(mintKeypair.publicKey);
    if (mintInfo.value?.data && 'parsed' in mintInfo.value.data) {
      const mintData = mintInfo.value.data.parsed.info;
      console.log(`  - Mint: ${mintKeypair.publicKey.toString()}`);
      console.log(`  - Decimals: ${mintData.decimals}`);
      console.log(`  - Supply: ${(mintData.supply / Math.pow(10, mintData.decimals)).toLocaleString()}`);
      console.log(`  - Mint Authority: ${mintData.mintAuthority}`);
    }
    
    const tokenBalance = await connection.getTokenAccountBalance(associatedTokenAccount);
    console.log(`  - Your Balance: ${tokenBalance.value.uiAmount?.toLocaleString()} tokens`);
    
    // Save mint info to file
    const mintInfo_output = {
      mintAddress: mintKeypair.publicKey.toString(),
      decimals: decimals,
      supply: supply,
      symbol: 'USDC',
      owner: payer.publicKey.toString(),
      associatedTokenAccount: associatedTokenAccount.toString(),
      transaction: signature
    };
    
    fs.writeFileSync('deployed-token-info.json', JSON.stringify(mintInfo_output, null, 2));
    console.log('\n💾 Token info saved to deployed-token-info.json');
    
    console.log('\n🎉 SPL Token deployment successful!');
    console.log(`🪙 Mint Address: ${mintKeypair.publicKey.toString()}`);
    console.log(`💼 Your Token Account: ${associatedTokenAccount.toString()}`);
    
  } catch (error) {
    console.error('❌ Error deploying token:', error);
    if (error.logs) {
      console.log('\nTransaction logs:');
      error.logs.forEach(log => console.log('  ', log));
    }
  }
}

main().catch(console.error);