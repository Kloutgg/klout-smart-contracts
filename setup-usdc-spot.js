#!/usr/bin/env node

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { AdminClient, initialize, Wallet, OracleSource } = require('./sdk/lib/node');
const fs = require('fs');

// Configuration for Mainnet
const MAINNET_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=ca49b73e-00a4-42d0-8e60-ad1a01e3dc97';
const KEYPAIR_PATH = '../bilc.json';
const DRIFT_PROGRAM_ID = '7a247Z1uc66BycPHmL7xuGps2Jrym9RQngiWwgqQCtYn';
const USDC_MINT = 'HPhjqD2yktd9jvyvUrvkVSarUvs8gWT2CTGct5JzrZ48';

function loadKeypair(path) {
  const secretKeyString = fs.readFileSync(path, 'utf8');
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function initializeUSDCSpotMarket() {
  console.log('🚀 Starting USDC spot market initialization on Mainnet...');
  
  // Load wallet
  const keypair = loadKeypair(KEYPAIR_PATH);
  console.log(`📝 Loaded wallet: ${keypair.publicKey.toString()}`);
  
  // Connect to mainnet
  const connection = new Connection(MAINNET_RPC_URL, 'confirmed');
  console.log('🔗 Connected to mainnet');
  
  // Get SDK config for mainnet
  initialize({ env: 'mainnet-beta' });
  console.log('⚙️ SDK config loaded for mainnet');
  
  // Initialize AdminClient
  const driftClient = new AdminClient({
    connection: connection,
    wallet: new Wallet(keypair),
    programID: new PublicKey(DRIFT_PROGRAM_ID),
    env: 'mainnet-beta'
  });
  
  console.log('🏗️ AdminClient created');
  
  try {
    // Subscribe to drift client
    await driftClient.subscribe();
    console.log('✅ DriftClient subscribed');
    
    // Initialize USDC spot market
    console.log('\n💰 Initializing USDC spot market...');
    try {
      const state = driftClient.getStateAccount();
      const spotMarketExists = state.numberOfSpotMarkets > 0;
      
      if (!spotMarketExists) {
        console.log('  🆕 Creating USDC spot market (market index 0)...');
        console.log(`  🪙 USDC Mint: ${USDC_MINT}`);
        console.log(`  🏦 Drift Program: ${DRIFT_PROGRAM_ID}`);
        
        // Standard spot market parameters for USDC (quote asset)
        const optimalUtilization = 500000; // 50% utilization
        const optimalRate = 1000000; // 100% APR 
        const maxRate = 1000000; // 100% APR
        const initialAssetWeight = 10000; // Must be 10000 for quote asset
        const maintenanceAssetWeight = 10000; // Must be 10000 for quote asset
        const initialLiabilityWeight = 10000; // Must be 10000 for quote asset 
        const maintenanceLiabilityWeight = 10000; // Must be 10000 for quote asset
        const imfFactor = 0;
        
        console.log('  📊 Market Parameters:');
        console.log(`    Optimal Utilization: ${optimalUtilization}`);
        console.log(`    Optimal Rate: ${optimalRate}`);
        console.log(`    Max Rate: ${maxRate}`);
        console.log(`    Initial Asset Weight: ${initialAssetWeight}`);
        console.log(`    Maintenance Asset Weight: ${maintenanceAssetWeight}`);
        console.log(`    Initial Liability Weight: ${initialLiabilityWeight}`);
        console.log(`    Maintenance Liability Weight: ${maintenanceLiabilityWeight}`);
        console.log(`    IMF Factor: ${imfFactor}`);
        
        await driftClient.initializeSpotMarket(
          new PublicKey(USDC_MINT),
          optimalUtilization,
          optimalRate, 
          maxRate,
          PublicKey.default, // No oracle for quote asset
          OracleSource.QUOTE_ASSET,
          initialAssetWeight,
          maintenanceAssetWeight,
          initialLiabilityWeight,
          maintenanceLiabilityWeight,
          imfFactor
        );
        
        console.log('  ✅ USDC spot market created successfully!');
        await sleep(2000);
        
        // Refresh and verify
        await driftClient.fetchAccounts();
        const updatedState = driftClient.getStateAccount();
        console.log(`  📈 Number of spot markets after creation: ${updatedState.numberOfSpotMarkets}`);
        
      } else {
        console.log('  ℹ️ USDC spot market already exists');
        console.log(`  📈 Current number of spot markets: ${state.numberOfSpotMarkets}`);
      }
    } catch (error) {
      console.error('  ❌ Error creating USDC spot market:', error.message);
      if (error.logs) {
        console.error('  📋 Transaction logs:', error.logs);
      }
      throw error;
    }
    
    console.log('\n🎉 USDC spot market initialization completed!');
    console.log('\n📋 Summary:');
    console.log(`  • Network: Mainnet`);
    console.log(`  • USDC Mint: ${USDC_MINT}`);
    console.log(`  • Drift Program ID: ${DRIFT_PROGRAM_ID}`);
    console.log(`  • Wallet: ${keypair.publicKey.toString()}`);
    
    // Cleanup
    await driftClient.unsubscribe();
    console.log('🧹 DriftClient unsubscribed');
    
  } catch (error) {
    console.error('❌ Error during USDC spot market initialization:', error);
    throw error;
  }
}

// Run the script
if (require.main === module) {
  initializeUSDCSpotMarket()
    .then(() => {
      console.log('\n✨ USDC spot market initialization completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 USDC spot market initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeUSDCSpotMarket };