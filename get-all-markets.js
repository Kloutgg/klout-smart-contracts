const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { 
  TestClient,
  BulkAccountLoader,
  Wallet,
  findAllMarketAndOracles
} = require('@drift-labs/sdk');
const fs = require('fs');

// Configuration
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=ca49b73e-00a4-42d0-8e60-ad1a01e3dc97";
const WALLET_PATH = "../bilc.json";
const DRIFT_PROGRAM_ID = new PublicKey("4kH6FqaZvGj1Mckg2wkZ75YhNYK7mm1U2ugUoUXWy45T");

// Helper function to format BN values
function formatBN(bn, precision = 6) {
  if (!bn) return '0';
  return (parseFloat(bn.toString()) / Math.pow(10, precision)).toFixed(6);
}

// Helper function to format market name
function formatMarketName(nameArray) {
  return Buffer.from(nameArray).toString().replace(/\0/g, '').trim();
}

// Helper function to get oracle source name
function getOracleSourceName(oracleSource) {
  const sources = {
    'pyth': 'PYTH',
    'pyth1K': 'PYTH_1K',
    'pyth1M': 'PYTH_1M',
    'pythPull': 'PYTH_PULL',
    'pyth1KPull': 'PYTH_1K_PULL',
    'pyth1MPull': 'PYTH_1M_PULL',
    'switchboard': 'SWITCHBOARD',
    'quoteAsset': 'QUOTE_ASSET',
    'pythStableCoin': 'PYTH_STABLE_COIN',
    'pythStableCoinPull': 'PYTH_STABLE_COIN_PULL',
    'prelaunch': 'PRELAUNCH',
    'switchboardOnDemand': 'SWITCHBOARD_ON_DEMAND',
    'pythLazer': 'PYTH_LAZER',
    'pythLazer1K': 'PYTH_LAZER_1K',
    'pythLazer1M': 'PYTH_LAZER_1M',
    'pythLazerStableCoin': 'PYTH_LAZER_STABLE_COIN'
  };
  
  const sourceKey = Object.keys(oracleSource)[0];
  return sources[sourceKey] || 'UNKNOWN';
}

// Helper function to get contract tier name
function getContractTierName(contractTier) {
  const tiers = {
    'a': 'TIER_A',
    'b': 'TIER_B', 
    'c': 'TIER_C',
    'speculative': 'SPECULATIVE',
    'highlySpeculative': 'HIGHLY_SPECULATIVE',
    'isolated': 'ISOLATED'
  };
  
  const tierKey = Object.keys(contractTier)[0];
  return tiers[tierKey] || 'UNKNOWN';
}

// Helper function to get market status name
function getMarketStatusName(status) {
  const statuses = {
    'initialized': 'INITIALIZED',
    'active': 'ACTIVE',
    'fundingPaused': 'FUNDING_PAUSED',
    'ammPaused': 'AMM_PAUSED',
    'fillPaused': 'FILL_PAUSED',
    'withdrawPaused': 'WITHDRAW_PAUSED',
    'reduceOnly': 'REDUCE_ONLY',
    'settlement': 'SETTLEMENT',
    'delisted': 'DELISTED'
  };
  
  const statusKey = Object.keys(status)[0];
  return statuses[statusKey] || 'UNKNOWN';
}

// Helper function to get asset tier name
function getAssetTierName(assetTier) {
  const tiers = {
    'collateral': 'COLLATERAL',
    'protected': 'PROTECTED',
    'cross': 'CROSS',
    'isolated': 'ISOLATED',
    'unlisted': 'UNLISTED'
  };
  
  const tierKey = Object.keys(assetTier)[0];
  return tiers[tierKey] || 'UNKNOWN';
}

async function getAllMarkets() {
  console.log("🔍 FETCHING ALL MARKET DETAILS FROM DRIFT CONTRACT");
  console.log("=" .repeat(80));
  
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
  );
  console.log("📝 Wallet:", keypair.publicKey.toBase58());

  const provider = new anchor.AnchorProvider(
    new Connection(DEVNET_RPC, 'confirmed'),
    new Wallet(keypair),
    { commitment: 'confirmed', preflightCommitment: 'confirmed' }
  );
  
  console.log("💰 Balance:", ((await provider.connection.getBalance(keypair.publicKey)) / 1e9).toFixed(2), "SOL");

  const driftClient = new TestClient({
    connection: provider.connection,
    wallet: provider.wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [],
    spotMarketIndexes: [],
    oracleInfos: [],
    accountSubscription: {
      type: 'polling',
      accountLoader: new BulkAccountLoader(provider.connection, 'confirmed', 0),
    },
  });

  try {
    await driftClient.subscribe();
    
    // Get all markets and oracles
    console.log("\n🔍 Fetching all markets from contract...");
    const { 
      perpMarketAccounts, 
      spotMarketAccounts,
      oracleInfos 
    } = await findAllMarketAndOracles(driftClient.program);

    console.log(`\n📊 MARKET SUMMARY:`);
    console.log(`   Perpetual Markets: ${perpMarketAccounts.length}`);
    console.log(`   Spot Markets: ${spotMarketAccounts.length}`);
    console.log(`   Total Markets: ${perpMarketAccounts.length + spotMarketAccounts.length}`);
    console.log(`   Oracles: ${oracleInfos.length}`);

    // Display Perpetual Markets
    if (perpMarketAccounts.length > 0) {
      console.log("\n" + "=".repeat(80));
      console.log("🏪 PERPETUAL MARKETS");
      console.log("=".repeat(80));
      
      perpMarketAccounts.forEach((market, index) => {
        const marketName = formatMarketName(market.name);
        const oracleSource = getOracleSourceName(market.amm.oracleSource);
        const contractTier = getContractTierName(market.contractTier);
        const status = getMarketStatusName(market.status);
        
        console.log(`\n📈 Market ${index + 1}: ${marketName}`);
        console.log(`   Market Index: ${market.marketIndex}`);
        console.log(`   Status: ${status}`);
        console.log(`   Contract Tier: ${contractTier}`);
        console.log(`   Oracle: ${market.amm.oracle.toBase58()}`);
        console.log(`   Oracle Source: ${oracleSource}`);
        
        // AMM Details
        console.log(`   📊 AMM Details:`);
        console.log(`      Base Asset Reserve: ${formatBN(market.amm.baseAssetReserve, 6)}`);
        console.log(`      Quote Asset Reserve: ${formatBN(market.amm.quoteAssetReserve, 6)}`);
        console.log(`      Peg Multiplier: ${formatBN(market.amm.pegMultiplier, 6)}`);
        console.log(`      Base Spread: ${market.amm.baseSpread} bps (${(market.amm.baseSpread/10000).toFixed(4)}%)`);
        console.log(`      Max Spread: ${market.amm.maxSpread} bps (${(market.amm.maxSpread/10000).toFixed(4)}%)`);
        console.log(`      Curve Update Intensity: ${market.amm.curveUpdateIntensity}%`);
        
        // Price Information
        const oraclePrice = market.amm.historicalOracleData.lastOraclePrice;
        const markPrice = market.amm.lastMarkPriceTwap;
        console.log(`   💰 Price Information:`);
        console.log(`      Oracle Price: $${formatBN(oraclePrice, 6)}`);
        console.log(`      Mark Price TWAP: $${formatBN(markPrice, 6)}`);
        
        // Trading Stats
        console.log(`   📈 Trading Statistics:`);
        console.log(`      Volume 24H: ${formatBN(market.amm.volume24H, 6)}`);
        console.log(`      Base Asset Amount Long: ${formatBN(market.amm.baseAssetAmountLong, 6)}`);
        console.log(`      Base Asset Amount Short: ${formatBN(market.amm.baseAssetAmountShort, 6)}`);
        console.log(`      Number of Users: ${market.numberOfUsers}`);
        console.log(`      Number of Users with Base: ${market.numberOfUsersWithBase}`);
        
        // Margin Requirements
        console.log(`   🛡️ Margin Requirements:`);
        console.log(`      Initial Margin: ${(market.marginRatioInitial/100).toFixed(2)}%`);
        console.log(`      Maintenance Margin: ${(market.marginRatioMaintenance/100).toFixed(2)}%`);
        
        // Fees
        console.log(`   💸 Fee Structure:`);
        console.log(`      Liquidator Fee: ${(market.liquidatorFee/10000).toFixed(4)}%`);
        console.log(`      Insurance Fund Fee: ${(market.ifLiquidationFee/10000).toFixed(4)}%`);
        console.log(`      IMF Factor: ${(market.imfFactor/10000).toFixed(4)}%`);
        
        // Order Parameters
        console.log(`   📋 Order Parameters:`);
        console.log(`      Min Order Size: ${formatBN(market.amm.minOrderSize, 6)}`);
        console.log(`      Max Position Size: ${formatBN(market.amm.maxPositionSize, 6)}`);
        console.log(`      Order Step Size: ${formatBN(market.amm.orderStepSize, 6)}`);
        console.log(`      Order Tick Size: ${formatBN(market.amm.orderTickSize, 6)}`);
        
        // Funding
        console.log(`   💰 Funding Information:`);
        console.log(`      Last Funding Rate: ${formatBN(market.amm.lastFundingRate, 6)}`);
        console.log(`      Cumulative Funding Rate: ${formatBN(market.amm.cumulativeFundingRate, 6)}`);
        console.log(`      Funding Period: ${market.amm.fundingPeriod.toString()} seconds`);
        
        // PnL Pool
        console.log(`   💼 PnL Pool:`);
        console.log(`      Scaled Balance: ${formatBN(market.pnlPool.scaledBalance, 6)}`);
        console.log(`      Market Index: ${market.pnlPool.marketIndex}`);
        
        console.log(`   🔗 Market Address: ${market.pubkey.toBase58()}`);
      });
    }

    // Display Spot Markets
    if (spotMarketAccounts.length > 0) {
      console.log("\n" + "=".repeat(80));
      console.log("💎 SPOT MARKETS");
      console.log("=".repeat(80));
      
      spotMarketAccounts.forEach((market, index) => {
        const marketName = formatMarketName(market.name);
        const oracleSource = getOracleSourceName(market.oracleSource);
        const assetTier = getAssetTierName(market.assetTier);
        const status = getMarketStatusName(market.status);
        
        console.log(`\n💎 Market ${index + 1}: ${marketName}`);
        console.log(`   Market Index: ${market.marketIndex}`);
        console.log(`   Status: ${status}`);
        console.log(`   Asset Tier: ${assetTier}`);
        console.log(`   Mint: ${market.mint.toBase58()}`);
        console.log(`   Vault: ${market.vault.toBase58()}`);
        console.log(`   Oracle: ${market.oracle.toBase58()}`);
        console.log(`   Oracle Source: ${oracleSource}`);
        
        // Price Information
        const oraclePrice = market.historicalOracleData.lastOraclePrice;
        console.log(`   💰 Price Information:`);
        console.log(`      Oracle Price: $${formatBN(oraclePrice, 6)}`);
        console.log(`      Oracle Delay: ${market.historicalOracleData.lastOracleDelay.toString()} slots`);
        console.log(`      Oracle Confidence: ${formatBN(market.historicalOracleData.lastOracleConf, 6)}`);
        
        // Balance Information
        console.log(`   💼 Balance Information:`);
        console.log(`      Deposit Balance: ${formatBN(market.depositBalance, market.decimals)}`);
        console.log(`      Borrow Balance: ${formatBN(market.borrowBalance, market.decimals)}`);
        console.log(`      Max Token Deposits: ${formatBN(market.maxTokenDeposits, market.decimals)}`);
        
        // Interest Rates
        console.log(`   📊 Interest Rates:`);
        console.log(`      Optimal Utilization: ${(market.optimalUtilization/100).toFixed(2)}%`);
        console.log(`      Optimal Borrow Rate: ${(market.optimalBorrowRate/10000).toFixed(4)}%`);
        console.log(`      Max Borrow Rate: ${(market.maxBorrowRate/10000).toFixed(4)}%`);
        
        // Cumulative Interest
        console.log(`   📈 Cumulative Interest:`);
        console.log(`      Cumulative Deposit Interest: ${formatBN(market.cumulativeDepositInterest, market.decimals)}`);
        console.log(`      Cumulative Borrow Interest: ${formatBN(market.cumulativeBorrowInterest, market.decimals)}`);
        
        // Insurance Fund
        console.log(`   🛡️ Insurance Fund:`);
        console.log(`      Total Shares: ${formatBN(market.insuranceFund.totalShares, market.decimals)}`);
        console.log(`      User Shares: ${formatBN(market.insuranceFund.userShares, market.decimals)}`);
        console.log(`      Shares Base: ${formatBN(market.insuranceFund.sharesBase, market.decimals)}`);
        console.log(`      Unstaking Period: ${market.insuranceFund.unstakingPeriod.toString()} seconds`);
        
        // Revenue Pool
        console.log(`   💰 Revenue Pool:`);
        console.log(`      Scaled Balance: ${formatBN(market.revenuePool.scaledBalance, market.decimals)}`);
        console.log(`      Market Index: ${market.revenuePool.marketIndex}`);
        
        // Order Parameters
        console.log(`   📋 Order Parameters:`);
        console.log(`      Order Step Size: ${formatBN(market.orderStepSize, market.decimals)}`);
        console.log(`      Order Tick Size: ${formatBN(market.orderTickSize, market.decimals)}`);
        console.log(`      Min Order Size: ${formatBN(market.minOrderSize, market.decimals)}`);
        console.log(`      Max Position Size: ${formatBN(market.maxPositionSize, market.decimals)}`);
        
        // Fees
        console.log(`   💸 Fee Structure:`);
        console.log(`      Insurance Fund Liquidation Fee: ${(market.ifLiquidationFee/10000).toFixed(4)}%`);
        console.log(`      Liquidator Fee: ${(market.liquidatorFee/10000).toFixed(4)}%`);
        console.log(`      IMF Factor: ${(market.imfFactor/10000).toFixed(4)}%`);
        
        // Asset Weights
        console.log(`   ⚖️ Asset Weights:`);
        console.log(`      Initial Asset Weight: ${(market.initialAssetWeight/100).toFixed(2)}%`);
        console.log(`      Maintenance Asset Weight: ${(market.maintenanceAssetWeight/100).toFixed(2)}%`);
        console.log(`      Initial Liability Weight: ${(market.initialLiabilityWeight/100).toFixed(2)}%`);
        console.log(`      Maintenance Liability Weight: ${(market.maintenanceLiabilityWeight/100).toFixed(2)}%`);
        
        // Decimals
        console.log(`   🔢 Decimals: ${market.decimals}`);
        
        console.log(`   🔗 Market Address: ${market.pubkey.toBase58()}`);
      });
    }

    // Display Oracle Information
    if (oracleInfos.length > 0) {
      console.log("\n" + "=".repeat(80));
      console.log("🔮 ORACLE INFORMATION");
      console.log("=".repeat(80));
      
      oracleInfos.forEach((oracle, index) => {
        const oracleSource = getOracleSourceName(oracle.source);
        console.log(`\n🔮 Oracle ${index + 1}:`);
        console.log(`   Address: ${oracle.publicKey.toBase58()}`);
        console.log(`   Source: ${oracleSource}`);
      });
    }

    // Summary Statistics
    console.log("\n" + "=".repeat(80));
    console.log("📊 SUMMARY STATISTICS");
    console.log("=".repeat(80));
    
    const activePerpMarkets = perpMarketAccounts.filter(m => 
      Object.keys(m.status)[0] === 'active'
    );
    const activeSpotMarkets = spotMarketAccounts.filter(m => 
      Object.keys(m.status)[0] === 'active'
    );
    
    console.log(`✅ Active Perpetual Markets: ${activePerpMarkets.length}/${perpMarketAccounts.length}`);
    console.log(`✅ Active Spot Markets: ${activeSpotMarkets.length}/${spotMarketAccounts.length}`);
    
    // Market tier distribution
    const tierCounts = {};
    perpMarketAccounts.forEach(market => {
      const tier = getContractTierName(market.contractTier);
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    });
    
    console.log("\n📈 Perpetual Market Tier Distribution:");
    Object.entries(tierCounts).forEach(([tier, count]) => {
      console.log(`   ${tier}: ${count} markets`);
    });
    
    // Oracle source distribution
    const oracleSourceCounts = {};
    perpMarketAccounts.forEach(market => {
      const source = getOracleSourceName(market.amm.oracleSource);
      oracleSourceCounts[source] = (oracleSourceCounts[source] || 0) + 1;
    });
    
    console.log("\n🔮 Oracle Source Distribution:");
    Object.entries(oracleSourceCounts).forEach(([source, count]) => {
      console.log(`   ${source}: ${count} markets`);
    });

    console.log("\n🎉 Market details fetched successfully!");
    console.log("=".repeat(80));

    await driftClient.unsubscribe();

  } catch (error) {
    console.log("❌ Error fetching market details:", error.message);
    console.log("Stack:", error.stack);
  }
}

getAllMarkets().catch(console.error); 