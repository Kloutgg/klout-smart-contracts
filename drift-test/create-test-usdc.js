// create-test-usdc.js
// -----------------------------------------------------------------------------
// A dev-net USDC clone with proper on-chain metadata.
// -----------------------------------------------------------------------------

const fs = require('fs');
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  createMint,
  createAssociatedTokenAccountIdempotent,
  mintTo,
} = require('@solana/spl-token');
const {
  PROGRAM_ID: TOKEN_METADATA_PROGRAM_ID,
  createCreateMetadataAccountV3Instruction,
} = require('@metaplex-foundation/mpl-token-metadata');

// -----------------------------------------------------------------------------
// Helper - create metadata V3 (name ≤ 32 bytes, symbol ≤ 10 bytes, uri ≤ 200 chars)
// -----------------------------------------------------------------------------
async function createTokenMetadata(connection, payer, mint) {
  const name   = 'Test USDC';                     // 1–32 bytes
  const symbol = 'TUSDC';                         // 1–10 bytes
  const uri    = 'https://example.com/tusdc.json';// Upload a JSON manifest here

  // Derive Metadata PDA
  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  );

  // Build the instruction
  const ix = createCreateMetadataAccountV3Instruction(
    {
      metadata:       metadataPDA,
      mint,
      mintAuthority:  payer.publicKey,
      payer:          payer.publicKey,
      updateAuthority:payer.publicKey,
    },
    {
      createMetadataAccountArgsV3: {
        data: {
          name,
          symbol,
          uri,
          sellerFeeBasisPoints: 0,
          creators: null,
          collection: null,
          uses: null,
        },
        isMutable: true,
        collectionDetails: null,
      },
    },
  );

  // Send the transaction
  const tx  = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log(`   ✅ Metadata tx: https://explorer.solana.com/tx/${sig}?cluster=devnet`);

  return metadataPDA;
}

// -----------------------------------------------------------------------------
// Main flow
// -----------------------------------------------------------------------------
async function main() {
  console.log('🪙 Creating test USDC mint for development…');

  const rpcUrl     = 'https://devnet.helius-rpc.com/?api-key=ca49b73e-00a4-42d0-8e60-ad1a01e3dc97';
  const connection = new Connection(rpcUrl, 'confirmed');

  // Load wallet
  const keypairPath = '../../bilc.json';                 // ← adjust if needed
  const payer       = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
  );
  console.log(`Using wallet: ${payer.publicKey.toBase58()}`);

  try {
    // 1. Mint
    console.log('🏭 Creating mint…');
    const mint = await createMint(
      connection,
      payer,
      payer.publicKey,   // mint authority
      payer.publicKey,   // freeze authority
      6,                 // decimals
    );
    console.log(`✅ Mint: ${mint.toBase58()}`);

    // 2. Metadata
    console.log('📋 Creating token metadata…');
    const metadataPDA = await createTokenMetadata(connection, payer, mint);

    // 3. Associated token account
    console.log('🏦 Creating token account…');
    const ata = await createAssociatedTokenAccountIdempotent(
      connection,
      payer,
      mint,
      payer.publicKey,
    );
    console.log(`✅ Token account: ${ata.toBase58()}`);

    // 4. Mint some tokens
    const amount = 1_000 * 10 ** 6; // 1000 * 10^decimals
    console.log('💰 Minting 1000 test USDC…');
    await mintTo(connection, payer, mint, ata, payer.publicKey, amount);
    console.log('✅ Minted!');

    // 5. Show balance
    const bal = await connection.getTokenAccountBalance(ata);
    console.log(`💰 Balance: ${bal.value.uiAmount} Test USDC`);

    // 6. Done
    console.log('\n🚀 All set! Your token should now display as “Test USDC (TUSDC)” on Solscan and in wallets.');
    console.log(`   Metadata PDA: ${metadataPDA.toBase58()}`);
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

main().catch(console.error);
