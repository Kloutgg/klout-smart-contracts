#!/usr/bin/env node

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { AdminClient, initialize, Wallet } = require('./sdk/lib/node');
const fs = require('fs');

// Configuration
const DEVNET_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=ca49b73e-00a4-42d0-8e60-ad1a01e3dc97';
const KEYPAIR_PATH = '../bilc.json';

// Devnet addresses from Anchor.toml
const DRIFT_PROGRAM_ID = '5jFCVBdddzyTjrWSEcY6bKGxq6J6aznuWQeLsxYinAMp';

// USDC mint address - specify your USDC mint here
const USDC_MINT_ADDRESS = 'HPhjqD2yktd9jvyvUrvkVSarUvs8gWT2CTGct5JzrZ48'; // Replace with your USDC mint address

function loadKeypair(path) {
  const secretKeyString = fs.readFileSync(path, 'utf8');
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function initializeDrift() {
  console.log('🚀 Starting Drift program initialization...');
  
  // Load wallet
  const keypair = loadKeypair(KEYPAIR_PATH);
  console.log(`📝 Loaded wallet: ${keypair.publicKey.toString()}`);
  
  // Connect to devnet
  const connection = new Connection(DEVNET_RPC_URL, 'confirmed');
  console.log('🔗 Connected to mainnet');
  
  // Check wallet balance
  const balance = await connection.getBalance(keypair.publicKey);
  console.log(`💰 Wallet balance: ${balance / 1e9} SOL`);
  if (balance < 1e9) { // Less than 1 SOL
    console.warn('⚠️ Warning: Low SOL balance. You may need more SOL for transactions.');
  }
  
  // Use specified USDC mint
  const usdcMint = new PublicKey(USDC_MINT_ADDRESS);
  console.log(`🏦 Using USDC mint: ${usdcMint.toString()}`);
  
  try {
    // Initialize Drift
    console.log('\n🏗️ Setting up Drift...');
    
    // Get SDK config for mainnet
    initialize({ env: 'mainnet-beta' });
    console.log('⚙️ SDK config loaded');
    
    // Initialize AdminClient (which has initialize method)
    const driftClient = new AdminClient({
      connection: connection,
      wallet: new Wallet(keypair),
      programID: new PublicKey(DRIFT_PROGRAM_ID),
      env: 'mainnet-beta'
    });
    
    console.log('🏗️ AdminClient created');
    
    // Check if drift is already initialized (without subscribing first)
    let isInitialized = false;
    try {
      const statePublicKey = await driftClient.getStatePublicKey();
      const accountInfo = await connection.getAccountInfo(statePublicKey);
      if (accountInfo) {
        isInitialized = true;
        console.log('ℹ️ Drift is already initialized');
      }
    } catch (e) {
      console.log('🆕 Drift needs to be initialized');
    }
    
    // Initialize drift contracts if not already done
    if (!isInitialized) {
      console.log('🏗️ Initializing Drift contracts...');
      
      const adminControlsPrices = true;
      
      await driftClient.initialize(usdcMint, adminControlsPrices);
      console.log('✅ Drift contracts initialized');
      
      // Wait a bit for initialization to settle
      await sleep(2000);
    }
    
    // Summary
    console.log('\n🎉 Drift program initialization completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`  • USDC Mint: ${usdcMint.toString()}`);
    console.log(`  • Drift Program ID: ${DRIFT_PROGRAM_ID}`);
    console.log(`  • Admin Wallet: ${keypair.publicKey.toString()}`);
    
    console.log('\n✨ Drift program is now initialized and ready to use!');
    
  } catch (error) {
    console.error('❌ Error during setup:', error);
    throw error;
  }
}

// Run the script
if (require.main === module) {
  initializeDrift()
    .then(() => {
      console.log('\n✨ Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error);
      process.exit(1);
    });
}

module.exports = { 
  initializeDrift
}; 