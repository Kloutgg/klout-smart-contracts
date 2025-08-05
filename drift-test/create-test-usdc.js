// create-fixed-usdc.js
// -----------------------------------------------------------------------------
// Dev-net “Test USDC” – fixed supply of 1 B tokens.
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
  setAuthority,
  AuthorityType,
} = require('@solana/spl-token');
const {
  PROGRAM_ID: TOKEN_METADATA_PROGRAM_ID,
  createCreateMetadataAccountV3Instruction,
} = require('@metaplex-foundation/mpl-token-metadata');

// -----------------------------------------------------------------------------
// Helper – create metadata V3
// -----------------------------------------------------------------------------
async function createTokenMetadata(connection, payer, mint) {
  const name   = 'Test USDC';                     // ≤ 32 bytes
  const symbol = 'TUSDC';                         // ≤ 10 bytes
  const uri    = 'https://klout.gg';// ≤ 200 chars

  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  );

  const ix = createCreateMetadataAccountV3Instruction(
    {
      metadata:        metadataPDA,
      mint,
      mintAuthority:   payer.publicKey,
      payer:           payer.publicKey,
      updateAuthority: payer.publicKey,
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

  const tx  = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log(`   ✅ Metadata tx: https://explorer.solana.com/tx/${sig}`);
  return metadataPDA;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  console.log('🪙 Creating fixed-supply Test USDC…');

  const rpcUrl     = 'https://mainnet.helius-rpc.com/?api-key=ca49b73e-00a4-42d0-8e60-ad1a01e3dc97';
  const connection = new Connection(rpcUrl, 'confirmed');

  // Load wallet
  const keypairPath = '../../bilc.json';          // ← adjust if needed
  const payer       = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
  );
  console.log(`Using wallet: ${payer.publicKey.toBase58()}`);

  try {
    // 1. Create mint (6 decimals)
    console.log('🏭 Creating mint…');
    const mint = await createMint(
      connection,
      payer,
      payer.publicKey,  // mint authority
      payer.publicKey,  // freeze authority (will remove later if desired)
      6,
    );
    console.log(`✅ Mint: ${mint.toBase58()}`);

    // 2. Metadata
    console.log('📋 Creating metadata…');
    const metadataPDA = await createTokenMetadata(connection, payer, mint);

    // 3. Create associated token account
    console.log('🏦 Creating token account…');
    const ata = await createAssociatedTokenAccountIdempotent(
      connection,
      payer,
      mint,
      payer.publicKey,
    );
    console.log(`✅ Token account: ${ata.toBase58()}`);

    // 4. Mint the full supply (1 000 000 000 tokens)
    const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 6n; // bigint
    console.log('💰 Minting 1 000 000 000 tokens…');
    await mintTo(connection, payer, mint, ata, payer.publicKey, TOTAL_SUPPLY);
    console.log('✅ Supply minted!');

    // 5. Revoke mint authority (fixed supply)
    console.log('🔒 Revoking mint authority…');
    await setAuthority(
      connection,
      payer,
      mint,
      payer.publicKey,
      AuthorityType.MintTokens,
      null,          // new authority = none
    );
    console.log('✅ Mint authority removed');

    // 6. (Optional) Revoke freeze authority too
    // await setAuthority(
    //   connection,
    //   payer,
    //   mint,
    //   payer.publicKey,
    //   AuthorityType.FreezeAccount,
    //   null,
    // );
    // console.log('✅ Freeze authority removed');

    // 7. Show balance
    const bal = await connection.getTokenAccountBalance(ata);
    console.log(`💰 Balance: ${bal.value.uiAmount} Test USDC`);

    // 8. Finished
    console.log('\n🚀 Done! Your token is live with a fixed supply of 1 B.');
    console.log(`   Metadata PDA: ${metadataPDA.toBase58()}`);
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

main().catch(console.error);
