const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');

async function main() {
  // Use your configured devnet RPC URL
  const rpcUrl = 'https://devnet.helius-rpc.com/?api-key=ca49b73e-00a4-42d0-8e60-ad1a01e3dc97';
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Load your keypair from the correct path
  const keypairPath = '/Users/moreshkokane/Documents/code/bilc.json';
  console.log(`Loading keypair from: ${keypairPath}`);
  
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  
  console.log(`Wallet address: ${keypair.publicKey.toString()}`);
  
  // Check SOL balance
  const balance = await connection.getBalance(keypair.publicKey);
  const solBalance = balance / LAMPORTS_PER_SOL;
  console.log(`Current SOL balance: ${solBalance} SOL`);
  
  if (solBalance < 0.1) {
    console.log('\nBalance is low. Requesting airdrop...');
    try {
      const airdropSignature = await connection.requestAirdrop(
        keypair.publicKey,
        2 * LAMPORTS_PER_SOL // Request 2 SOL
      );
      
      console.log('Airdrop signature:', airdropSignature);
      console.log('Waiting for airdrop confirmation...');
      
      await connection.confirmTransaction(airdropSignature);
      
      // Check balance again
      const newBalance = await connection.getBalance(keypair.publicKey);
      const newSolBalance = newBalance / LAMPORTS_PER_SOL;
      console.log(`New SOL balance: ${newSolBalance} SOL`);
    } catch (err) {
      console.error('Airdrop failed:', err.message);
      console.log('You can manually request SOL from: https://faucet.solana.com/');
    }
  } else {
    console.log('Balance is sufficient!');
  }
}

main().catch(console.error); 