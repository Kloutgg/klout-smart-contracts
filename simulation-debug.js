const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const { 
  BN, 
  TestClient, 
  BulkAccountLoader,
  BASE_PRECISION,
  Wallet
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("4r69MyZAKmJ1UR21tndDKpkGXs9Pa9MuhzAVEtF5KZGY");
const USDC_MINT = new PublicKey("86wU3KdufXJAiQAipYnx6tZH76np9jw7FYFgVUsxekAC");

async function main() {
  console.log("🔍 TRANSACTION SIMULATION DEBUG");
  
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  
  // Let's try to build the instruction manually and simulate it
  const provider = new anchor.AnchorProvider(
    connection,
    new Wallet(keypair),
    { commitment: 'confirmed', preflightCommitment: 'confirmed' }
  );

  const bulkAccountLoader = new BulkAccountLoader(provider.connection, 'confirmed', 0);
  
  const driftClient = new TestClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [0],
    spotMarketIndexes: [0],
    oracleInfos: [],
    accountSubscription: {
      type: 'polling',
      accountLoader: bulkAccountLoader,
    },
  });

  try {
    // Initialize
    try {
      await driftClient.initialize(USDC_MINT, true);
    } catch (initError) {
      if (!initError.message.includes('already initialized')) {
        throw initError;
      }
    }

    await driftClient.subscribe();
    await driftClient.fetchAccounts();

    // Try to get the instruction and simulate it manually for better error details
    console.log("🔧 Building initializePerpMarket instruction...");
    
    const solOracle = new PublicKey("CAXyA9sH9vHdWYb2zY7AdK5gydSRRo2Z2Nzrfns9PFZi");
    const ammInitialBaseAssetAmount = new BN(1000).mul(BASE_PRECISION);
    const ammInitialQuoteAssetAmount = new BN(1000).mul(BASE_PRECISION);
    
    try {
      // Get the initialize perp market instruction
      const initializeMarketIx = await driftClient.getInitializePerpMarketIx(
        0,                              // marketIndex
        solOracle,                      // oracle
        ammInitialBaseAssetAmount,      // baseAssetReserve
        ammInitialQuoteAssetAmount,     // quoteAssetReserve
        new BN(3600),                   // periodicity
        new BN(1000000),                // pegMultiplier (1.0)
      );

      console.log("✅ Instruction built successfully");
      console.log("🔍 Instruction details:");
      console.log(`  Program: ${initializeMarketIx.programId.toBase58()}`);
      console.log(`  Keys: ${initializeMarketIx.keys.length}`);
      
      // Create transaction and get recent blockhash
      const tx = new Transaction();
      tx.add(initializeMarketIx);
      
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = keypair.publicKey;

      console.log("🔍 Simulating transaction with detailed logs...");
      
      // Simulate with maximum detail
      const simulationResult = await connection.simulateTransaction(tx, {
        sigVerify: false,
        commitment: 'confirmed',
        replaceRecentBlockhash: true,
        accounts: {
          encoding: 'base64',
          addresses: initializeMarketIx.keys.map(k => k.pubkey.toBase58())
        }
      });

      console.log("📋 Simulation Result:");
      console.log(`  Error: ${simulationResult.value.err}`);
      console.log(`  Logs:`);
      if (simulationResult.value.logs) {
        simulationResult.value.logs.forEach((log, i) => {
          console.log(`    ${i}: ${log}`);
        });
      }
      
      if (simulationResult.value.accounts) {
        console.log("📊 Account states:");
        simulationResult.value.accounts.forEach((account, i) => {
          if (account) {
            console.log(`    ${i}: ${account.owner} (${account.lamports} lamports)`);
          }
        });
      }

      // Also check the oracle account specifically
      console.log("\n🔮 Oracle Account Check:");
      const oracleAccount = await connection.getAccountInfo(solOracle);
      if (oracleAccount) {
        console.log(`  ✅ Oracle exists: ${oracleAccount.data.length} bytes`);
        console.log(`  Owner: ${oracleAccount.owner.toBase58()}`);
        console.log(`  Lamports: ${oracleAccount.lamports}`);
        console.log(`  Executable: ${oracleAccount.executable}`);
        
        // Show first 32 bytes of data
        const firstBytes = Array.from(oracleAccount.data.slice(0, 32))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' ');
        console.log(`  Data (first 32 bytes): ${firstBytes}`);
      } else {
        console.log("  ❌ Oracle account doesn't exist");
      }

    } catch (instructionError) {
      console.log("❌ Failed to build instruction:", instructionError.message);
      console.log("Stack:", instructionError.stack);
    }

  } catch (error) {
    console.log("❌ Fatal error:", error.message);
  } finally {
    try {
      await driftClient.unsubscribe();
    } catch (err) {}
  }
}

main().catch(console.error); 