# GHI-PERP Oracle Constraint Fix

## Problem
The GHI-PERP market uses a prelaunch oracle that gets updated based on trading activity. However, oracle staleness checks prevent `placeAndTakePerpOrder` from working immediately for new/inactive markets.

## Solution
This script updates the `oracle_slot_delay_override` parameter for GHI-PERP to be highly permissive, effectively disabling staleness checks for AMM fills.

## Usage

1. **Prerequisites:**
   - Ensure you have admin wallet (`bilc.json`) in the parent directory (one level up from protocol-v2)
   - Admin wallet must be the current protocol admin
   - Admin wallet needs sufficient SOL balance (>0.01 SOL)

2. **Run the script:**
   ```bash
   cd protocol-v2
   node update-ghi-oracle-constraints.js
   ```

3. **Expected output:**
   - ✅ Admin permissions verified
   - 📊 Current market state displayed  
   - 🔄 Oracle slot delay updated to -1 (disables staleness checks)
   - ✅ Transaction confirmed with Solscan link

## What This Does

- **Sets `oracle_slot_delay_override = -1`** for GHI-PERP (market index 2)  
- **Note**: Parameter is `i8` type (range -128 to +127), -1 typically disables checks
- **Disables staleness checks** - AMM will accept trades regardless of oracle age
- **Enables immediate execution** - `placeAndTakePerpOrder` will work instantly via vAMM
- **Preserves other oracle checks** - Confidence intervals and other validations remain

## After Running

Once successful, users can:
- Place immediate orders via `placeAndTakePerpOrder` 
- Orders will route directly to vAMM without waiting
- Positions will be created instantly upon order submission
- No more "Confidence Too Large" or staleness errors

## Verification

Check if it worked:
1. Look for transaction confirmation in output
2. Try placing a trade in the UI - should execute immediately
3. Oracle logs should no longer show staleness errors 