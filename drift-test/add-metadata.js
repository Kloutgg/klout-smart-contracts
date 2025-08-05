#!/usr/bin/env node

const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, SYSVAR_RENT_PUBKEY } = require('@solana/web3.js');
const fs = require('fs');

// Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

async function addMetadata(mintAddress, name, symbol, description = '') {
  console.log(`🏷️  Adding metadata to token: ${mintAddress}`);
  console.log(`   Name: ${name}`);
  console.log(`   Symbol: ${symbol}`);
  
  // Connect to devnet
  const rpcUrl = 'https://devnet.helius-rpc.com/?api-key=ca49b73e-00a4-42d0-8e60-ad1a01e3dc97';
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Load keypair
  const keypairPath = '../../bilc.json';
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(new Uint8Array(keypairData));
  
  console.log(`🔑 Using wallet: ${payer.publicKey.toString()}`);
  
  const mint = new PublicKey(mintAddress);
  
  // Find metadata PDA
  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  
  console.log(`📍 Metadata PDA: ${metadataPDA.toString()}`);
  
  // Check if metadata already exists
  try {
    const metadataAccount = await connection.getAccountInfo(metadataPDA);
    if (metadataAccount) {
      console.log(`⚠️  Metadata already exists for this token!`);
      return;
    }
  } catch (e) {
    // Metadata doesn't exist, continue
  }
  
  // Build instruction data manually (simplified CreateMetadataAccount)
  const nameBuffer = Buffer.from(name, 'utf8');
  const symbolBuffer = Buffer.from(symbol, 'utf8');
  const uriBuffer = Buffer.from('', 'utf8'); // Empty URI
  
  // Borsh serialization format for CreateMetadataAccountArgs
  const data = Buffer.concat([
    Buffer.from([0]), // CreateMetadataAccount discriminator
    // DataV2 struct
    Buffer.from([nameBuffer.length, 0, 0, 0]), // name length (u32 LE)
    nameBuffer,
    Buffer.from([symbolBuffer.length, 0, 0, 0]), // symbol length (u32 LE)  
    symbolBuffer,
    Buffer.from([uriBuffer.length, 0, 0, 0]), // uri length (u32 LE)
    uriBuffer,
    Buffer.from([0, 0]), // seller_fee_basis_points (u16 LE)
    Buffer.from([0]), // creators option (0 = None)
    Buffer.from([1]), // is_mutable (bool)
    Buffer.from([0]), // edition_nonce option (0 = None)
    Buffer.from([0]), // token_standard option (0 = None)  
    Buffer.from([0]), // collection option (0 = None)
    Buffer.from([0]), // uses option (0 = None)
  ]);
  
  // Account metas
  const keys = [
    { pubkey: metadataPDA, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: payer.publicKey, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];
  
  const instruction = new TransactionInstruction({
    keys,
    programId: TOKEN_METADATA_PROGRAM_ID,
    data,
  });
  
  const transaction = new Transaction().add(instruction);
  
  try {
    console.log('📤 Sending metadata transaction...');
    const signature = await connection.sendTransaction(transaction, [payer]);
    await connection.confirmTransaction(signature, 'confirmed');
    
    console.log(`✅ Metadata added successfully!`);
    console.log(`📋 Transaction: ${signature}`);
    console.log(`🔍 Check on Solscan: https://solscan.io/token/${mintAddress}?cluster=devnet`);
    
  } catch (error) {
    console.log(`❌ Failed to add metadata: ${error.message}`);
    
    // Alternative suggestion
    console.log(`\n💡 Alternative approaches:`);
    console.log(`1. Use Solana CLI (if you have it):`);
    console.log(`   solana program deploy --program-id metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`);
    console.log(`\n2. Use web-based tools once they're back online`);
    console.log(`\n3. Manual wallet interaction with dApps that support metadata creation`);
  }
}

// Command line usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log(`Usage: node add-metadata.js <MINT_ADDRESS> <NAME> <SYMBOL> [DESCRIPTION]`);
    console.log(`Example: node add-metadata.js FcGoL4NgR8Tf3qGsnFBkbNxjrDhjjnFbwQMF4npgfFKc "Test USDC" "TUSDC"`);
    process.exit(1);
  }
  
  const [mintAddress, name, symbol, description] = args;
  addMetadata(mintAddress, name, symbol, description || '').catch(console.error);
}

module.exports = { addMetadata };