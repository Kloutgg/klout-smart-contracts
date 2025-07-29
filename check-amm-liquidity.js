const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");
const MNO_MARKET_INDEX = 4;

async function main() {
  console.log("🔍 CHECKING MNO-PERP AMM LIQUIDITY & RESERVES");
  console.log("==============================================");
  
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  console.log("📝 Admin Wallet:", keypair.publicKey.toBase58());

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  console.log("💰 Balance:", ((await connection.getBalance(keypair.publicKey)) / 1e9).toFixed(2), "SOL");

  try {
    // Create anchor provider and program
    const provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(keypair),
      { commitment: 'confirmed' }
    );
    
    // Load the IDL and create program instance
    const idl = JSON.parse(fs.readFileSync('./target/idl/drift.json', 'utf8'));
    const program = new anchor.Program(idl, DRIFT_PROGRAM_ID, provider);

    console.log("\n🔧 Getting MNO-PERP market data...");
    
    // Derive perp market account
    const [perpMarketAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode('perp_market')),
        new anchor.BN(MNO_MARKET_INDEX).toArrayLike(Buffer, 'le', 2)
      ],
      DRIFT_PROGRAM_ID
    );
    
    console.log(`   Perp Market Account: ${perpMarketAccount.toBase58()}`);
    
    // Get market account data
    const marketAccount = await program.account.perpMarket.fetch(perpMarketAccount);
    
    console.log("\n📊 MNO-PERP Market Status:");
    console.log("==========================");
    console.log(`   Market Index: ${marketAccount.marketIndex}`);
    console.log(`   Status: ${JSON.stringify(marketAccount.status)}`);
    console.log(`   Contract Tier: ${JSON.stringify(marketAccount.contractTier)}`);
    
    console.log("\n💰 AMM State & Liquidity:");
    console.log("=========================");
    const amm = marketAccount.amm;
    
    console.log(`   Oracle: ${amm.oracle.toBase58()}`);
    console.log(`   Oracle Source: ${JSON.stringify(amm.oracleSource)}`);
    console.log(`   Oracle Slot Delay Override: ${amm.oracleSlotDelayOverride}`);
    
    // Key AMM liquidity metrics
    console.log("\n🏦 AMM Reserves & Liquidity:");
    console.log("============================");
    console.log(`   Base Asset Reserve: ${amm.baseAssetReserve.toString()}`);
    console.log(`   Quote Asset Reserve: ${amm.quoteAssetReserve.toString()}`);
    console.log(`   Sqrt K: ${amm.sqrtK.toString()}`);
    
    // Safely check for optional properties
    if (amm.userBaseAssetAmount) {
      console.log(`   User Base Asset Amount: ${amm.userBaseAssetAmount.toString()}`);
    }
    if (amm.userQuoteAssetAmount) {
      console.log(`   User Quote Asset Amount: ${amm.userQuoteAssetAmount.toString()}`);
    }
    
    // Check if reserves are sufficient
    const baseReserve = parseFloat(amm.baseAssetReserve.toString());
    const quoteReserve = parseFloat(amm.quoteAssetReserve.toString());
    const sqrtK = parseFloat(amm.sqrtK.toString());
    
    console.log("\n🔍 Liquidity Analysis:");
    console.log("======================");
    
    if (baseReserve === 0 || quoteReserve === 0) {
      console.log("❌ CRITICAL: Zero reserves detected!");
      console.log("   The AMM has no liquidity to fill orders");
      console.log("   This is why placeAndTakePerpOrder only places but doesn't fill");
    } else if (sqrtK === 0) {
      console.log("❌ CRITICAL: SqrtK is zero!");
      console.log("   The AMM constant product is not initialized");
      console.log("   This prevents any trades from executing");
    } else {
      console.log("✅ AMM has non-zero reserves");
      console.log(`   Base Reserve: ${(baseReserve / 1e9).toFixed(4)} units`);
      console.log(`   Quote Reserve: ${(quoteReserve / 1e6).toFixed(2)} USDC`);
      console.log(`   Sqrt K: ${(sqrtK / 1e15).toFixed(4)} (scaled)`);
    }
    
    // Check AMM configuration
    console.log("\n⚙️  AMM Configuration:");
    console.log("======================");
    console.log(`   Peg Multiplier: ${amm.pegMultiplier.toString()}`);
    console.log(`   Base Spread: ${amm.baseSpread}`);
    console.log(`   Long Spread: ${amm.longSpread}`);
    console.log(`   Short Spread: ${amm.shortSpread}`);
    console.log(`   Max Spread: ${amm.maxSpread}`);
    
    // Price information
    console.log("\n💵 Price Information:");
    console.log("=====================");
    if (amm.terminalQuoteAssetReserve) {
      console.log(`   Terminal Quote Asset Reserve: ${amm.terminalQuoteAssetReserve.toString()}`);
    }
    if (amm.historicalOracleData) {
      console.log(`   Historical Oracle Data:`);
      if (amm.historicalOracleData.lastOraclePrice) {
        console.log(`     Last Oracle Price: ${amm.historicalOracleData.lastOraclePrice.toString()}`);
      }
      if (amm.historicalOracleData.lastOracleConf) {
        console.log(`     Last Oracle Conf: ${amm.historicalOracleData.lastOracleConf.toString()}`);
      }
    }
    
    // Additional debugging info
    console.log("\n🔧 AMM State Debug:");
    console.log("===================");
    console.log(`   AMM keys: ${Object.keys(amm).slice(0, 10).join(', ')}...`);
    
    // Check for any AMM state that might prevent fills
    if (amm.baseAssetAmountWithAmm !== undefined) {
      console.log(`   Base Asset Amount With AMM: ${amm.baseAssetAmountWithAmm.toString()}`);
    }
    if (amm.quoteAssetAmountWithAmm !== undefined) {
      console.log(`   Quote Asset Amount With AMM: ${amm.quoteAssetAmountWithAmm.toString()}`);
    }
    
    console.log("\n🎯 Diagnosis:");
    console.log("==============");
    
    if (baseReserve === 0 || quoteReserve === 0 || sqrtK === 0) {
      console.log("❌ CRITICAL: AMM has insufficient liquidity");
      console.log("   The AMM was created but doesn't have sufficient reserves");
      console.log("   This is why orders get placed but never filled immediately");
      
      console.log("\n📋 Next Steps:");
      console.log("   1. Add AMM liquidity using addAmmBaseAndQuoteAssets");
      console.log("   2. Or use repegAmmCurve to initialize with proper K");
      console.log("   3. Then placeAndTakePerpOrder should work immediately");
    } else {
      console.log("✅ AMM has reserves - but orders still not filling");
      console.log(`   Base Reserve: ${(baseReserve / 1e9).toFixed(4)} units`);
      console.log(`   Quote Reserve: ${(quoteReserve / 1e6).toFixed(2)} USDC`);
      console.log(`   SqrtK: ${(sqrtK / 1e12).toFixed(4)}`);
      
      console.log("\n🤔 Other Possible Issues:");
      console.log("   1. AMM spreads too wide (preventing fills)");
      console.log("   2. Order size larger than available liquidity depth");
      console.log("   3. Price impact too high");
      console.log("   4. AMM curve parameters preventing execution");
      console.log("   5. Need to manually crank/settle orders");
      
      console.log("\n🔧 Potential Solutions:");
      console.log("   1. Try a much smaller order size (0.01 units)");
      console.log("   2. Check if there are pending orders that need cranking");
      console.log("   3. Manually crank any pending orders");
      console.log("   4. Check AMM spreads and adjust if needed");
    }
    
  } catch (error) {
    console.log("❌ Error:", error.message);
    console.log("\n💡 This might indicate the market account doesn't exist");
    console.log("   or there's an issue with the account derivation");
  }
}

main().catch(console.error); 