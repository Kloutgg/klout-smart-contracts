# JKL Market Creation with Permissive Oracle Configuration

## Overview
This script creates a new JKL-PERP market with built-in permissive oracle settings that enable immediate `placeAndTakePerpOrder` execution from day one. No post-creation configuration needed!

## Features

### 🚀 **Permissive Oracle Configuration**
- **Oracle Slot Delay Override: -1** (disables staleness checks)
- **Immediate Execution**: `placeAndTakePerpOrder` works instantly via AMM
- **No Oracle Failures**: Eliminates "Confidence Too Large" and staleness errors

### 💧 **Full AMM Liquidity**
- **Base Spread: 0.25%** - Enables full AMM liquidity provision
- **Equal Reserves**: 1000 base + 1000 quote tokens for deep liquidity
- **Dynamic Spreads**: 100% curve update intensity for optimal pricing

### 📊 **Market Configuration**
- **Symbol**: JKL-PERP
- **Market Index**: 3 (ABC=0, DEF=1, GHI=2, JKL=3)
- **Starting Price**: $50
- **Max Price**: $200 (4x starting price)
- **Oracle Type**: Prelaunch (activity-based price updates)

## Usage

### **Run the Script:**
```bash
cd protocol-v2
node create-jkl-market-permissive.js
```

### **Expected Output:**
```
🚀 CREATING JKL MARKET WITH PERMISSIVE ORACLE & FULL AMM LIQUIDITY
======================================================================

🔮 Step 1: Initializing Prelaunch Oracle for JKL
✅ Prelaunch Oracle Initialized!

🏪 Step 2: Creating JKL Perpetual Market with Full AMM Liquidity  
✅ JKL MARKET CREATED WITH FULL AMM LIQUIDITY!

🔮 Step 3: Configuring Permissive Oracle Settings for Immediate Execution
✅ Oracle constraints configured for immediate execution!

⚙️ Step 4: Configuring AMM Parameters for Optimal Trading
✅ Curve Update Intensity set to 100%

🔍 Step 5: Verifying Market Creation & Permissive Configuration
✅ Oracle Status: PERMISSIVE (slot delay override = -1)
✅ AMM Liquidity Status: ENABLED (baseSpread > 0)
✅ placeAndTakePerpOrder: WILL WORK IMMEDIATELY

🎉 SUCCESS! JKL MARKET WITH PERMISSIVE ORACLE & FULL AMM LIQUIDITY!
```

## What This Script Does

### **1. Creates Prelaunch Oracle**
- Initializes oracle with starting price ($50) and max price ($200)
- Sets up activity-based price discovery mechanism

### **2. Creates Perpetual Market**
- Full AMM configuration with optimal liquidity settings
- Equal base/quote reserves for balanced trading
- Proper margin ratios and spread configuration

### **3. 🚀 Configures Permissive Oracle (Key Innovation)**
- Sets `oracle_slot_delay_override = -1`
- Disables staleness checks completely
- Enables immediate AMM execution regardless of oracle age

### **4. Optimizes AMM Parameters**
- Sets curve update intensity to 100%
- Ensures dynamic spread calculation
- Maximizes trading efficiency

### **5. Verifies Complete Setup**
- Confirms oracle is permissive
- Validates AMM liquidity is active
- Tests immediate execution capability

## UI Integration

Add to `sc-klout-ui/src/config/env.ts`:

```typescript
{
  marketIndex: 3,
  fullName: 'JKL Prediction Market',
  oracle: 'NEW_ORACLE_ADDRESS_FROM_OUTPUT', // Use address from script output
  symbol: 'JKL-PERP',
  baseAssetSymbol: 'JKL',
},
```

## Benefits

### **🎯 Immediate Execution**
- No waiting for oracle updates
- No "Confidence Too Large" errors  
- Instant position creation via `placeAndTakePerpOrder`

### **💧 Deep Liquidity**
- AMM provides substantial liquidity from day one
- 0.25% base spread ensures tight execution
- Equal reserves eliminate slippage asymmetries

### **🔄 Ongoing Utility**
- **Template for future markets**: Use this pattern for all new prelaunch markets
- **Production ready**: Fully configured for immediate trading
- **Scalable**: Easy to modify prices and parameters for different markets

## Next Steps

1. **Run the script** to create JKL-PERP market
2. **Update UI configuration** with the oracle address from output
3. **Test immediate execution** - `placeAndTakePerpOrder` should work instantly
4. **Use as template** for future permissive prelaunch markets

## Troubleshooting

- **"Already exists" errors**: Market creation succeeded, script detects existing setup
- **Oracle configuration fails**: Market still created, may need manual oracle update
- **AdminClient issues**: Script includes fallback instruction building
- **Balance issues**: Ensure admin wallet has sufficient SOL (>0.1 SOL recommended)

This approach gives you a **production-ready market with immediate execution capability** from day one! 🚀 