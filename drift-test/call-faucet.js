const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { initialize, BN } = require('@drift-labs/sdk');
const fs = require('fs');
const crypto = require('crypto');

function getAnchorDiscriminator(name) {
  // Anchor discriminator is first 8 bytes of SHA256 hash of "global:{name}"
  const hash = crypto.createHash('sha256').update(`global:${name}`).digest();
  return hash.slice(0, 8);
}

async function main() {
  console.log('🚰 Calling token faucet mint_to_user...');
  
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
  
  // Known values from previous script
  const tokenFaucetProgramId = new PublicKey('V4v1mQiAdLz4qwckEb45WqHYceYizoib39cDBHSWfaB');
  const usdcMint = new PublicKey(sdkConfig.USDC_MINT_ADDRESS);
  const faucetConfig = new PublicKey('A5TtJFy3PgCSg9MdBHLCHtewa7Sx613heaJ5atjNZCtJ');
  const mintAuthority = new PublicKey('7GWXZ5esgVjUek9zDapKN5QAXPFLT2E7MafLb1p7zF6U');
  
  try {
    // Get your USDC token account
    const userTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      keypair.publicKey
    );
    
    console.log(`Your USDC token account: ${userTokenAccount.toString()}`);
    
    // Amount to mint (50 USDC with 6 decimals)
    const amount = new BN(50 * 10**6);
    
    console.log(`Requesting ${amount.div(new BN(10**6)).toString()} USDC from faucet...`);
    
    // Build the mint_to_user instruction with correct discriminator
    const discriminator = getAnchorDiscriminator('mint_to_user');
    console.log(`Using discriminator: ${discriminator.toString('hex')}`);
    
    // Amount as little-endian u64
    const amountBuffer = Buffer.alloc(8);
    amountBuffer.writeBigUInt64LE(BigInt(amount.toString()), 0);
    
    const instructionData = Buffer.concat([discriminator, amountBuffer]);
    
    // Build accounts array according to IDL
    const accounts = [
      { pubkey: faucetConfig, isSigner: false, isWritable: false },
      { pubkey: usdcMint, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: mintAuthority, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    
    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: tokenFaucetProgramId,
      data: instructionData,
    });
    
    // Create and send transaction
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = keypair.publicKey;
    
    console.log('🚀 Sending transaction...');
    
    try {
      const signature = await connection.sendTransaction(transaction, [keypair]);
      console.log('✅ Transaction sent! Signature:', signature);
      
      // Wait for confirmation
      console.log('⏳ Waiting for confirmation...');
      await connection.confirmTransaction(signature);
      
      console.log('✅ Transaction confirmed!');
      console.log(`🔗 View on explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
      
      // Check balance
      const balance = await connection.getTokenAccountBalance(userTokenAccount);
      console.log(`💰 New USDC balance: ${balance.value.uiAmount} USDC`);
      
    } catch (txError) {
      console.error('❌ Transaction failed:', txError.message);
      
      if (txError.logs) {
        console.log('\nTransaction logs:');
        txError.logs.forEach(log => console.log('  ', log));
      }
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

main().catch(console.error); 