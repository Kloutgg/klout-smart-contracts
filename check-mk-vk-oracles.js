const { Connection, PublicKey } = require('@solana/web3.js');
const { 
  DriftClient,
  BulkAccountLoader,
  initialize
} = require('@drift-labs/sdk');

// Configuration
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=35e3349e-26bd-4c88-88f3-a3d99637ae01";
const DRIFT_PROGRAM_ID = new PublicKey("EZ535owQgTdZAStTvEe9NSdthHCqd1GCKwEYq29Exzhu");

async function checkMKHSAndVKHS() {
    console.log("🔍 MK-HS & VK-HS ORACLE CONFIGURATION VERIFICATION");
    console.log("=" .repeat(70));
    console.log();

    try {
        const connection = new Connection(DEVNET_RPC, 'confirmed');
        const dummyWallet = {
            publicKey: new PublicKey("11111111111111111111111111111111"),
            signTransaction: async () => { throw new Error("Read-only wallet"); },
            signAllTransactions: async () => { throw new Error("Read-only wallet"); }
        };

        const driftClient = new DriftClient({
            connection,
            wallet: dummyWallet,
            programID: DRIFT_PROGRAM_ID,
            env: 'devnet',
            accountSubscription: {
                type: 'polling',
                accountLoader: new BulkAccountLoader(connection, 'confirmed', 1000)
            }
        });

        await driftClient.subscribe();

        // Check MK-HS (Market Index 5)
        console.log("🎯 MK-HS (HS-MK-PERP) - Market Index 5");
        console.log("-".repeat(50));
        const mkhs = driftClient.getPerpMarketAccount(5);
        console.log(`Oracle Address: ${mkhs.amm.oracle.toString()}`);
        console.log(`Slot Delay Override: ${mkhs.amm.oracleSlotDelayOverride}`);
        console.log(`Oracle Valid: ${mkhs.amm.lastOracleValid}`);
        console.log(`Status: ${mkhs.amm.oracleSlotDelayOverride === -1 ? '🟢 PERMISSIVE' : '🔴 RESTRICTED'}`);
        console.log();

        // Check VK-HS (Market Index 6)
        console.log("🎯 VK-HS (VK-HS-PERP) - Market Index 6");
        console.log("-".repeat(50));
        const vkhs = driftClient.getPerpMarketAccount(6);
        console.log(`Oracle Address: ${vkhs.amm.oracle.toString()}`);
        console.log(`Slot Delay Override: ${vkhs.amm.oracleSlotDelayOverride}`);
        console.log(`Oracle Valid: ${vkhs.amm.lastOracleValid}`);
        console.log(`Status: ${vkhs.amm.oracleSlotDelayOverride === -1 ? '🟢 PERMISSIVE' : '🔴 RESTRICTED'}`);
        console.log();

        // Compare with MNO-PERP (which we know works)
        console.log("🎯 MNO-PERP (Reference) - Market Index 4");
        console.log("-".repeat(50));
        const mno = driftClient.getPerpMarketAccount(4);
        console.log(`Oracle Address: ${mno.amm.oracle.toString()}`);
        console.log(`Slot Delay Override: ${mno.amm.oracleSlotDelayOverride}`);
        console.log(`Oracle Valid: ${mno.amm.lastOracleValid}`);
        console.log(`Status: ${mno.amm.oracleSlotDelayOverride === -1 ? '🟢 PERMISSIVE' : '🔴 RESTRICTED'}`);
        console.log();

        console.log("📋 SUMMARY:");
        console.log("=" .repeat(70));
        console.log(`MK-HS: ${mkhs.amm.oracleSlotDelayOverride === -1 ? 'PERMISSIVE (-1)' : `RESTRICTED (${mkhs.amm.oracleSlotDelayOverride})`}`);
        console.log(`VK-HS: ${vkhs.amm.oracleSlotDelayOverride === -1 ? 'PERMISSIVE (-1)' : `RESTRICTED (${vkhs.amm.oracleSlotDelayOverride})`}`);
        console.log(`MNO-PERP: ${mno.amm.oracleSlotDelayOverride === -1 ? 'PERMISSIVE (-1)' : `RESTRICTED (${mno.amm.oracleSlotDelayOverride})`}`);
        console.log();
        
        const problemMarkets = [];
        if (mkhs.amm.oracleSlotDelayOverride !== -1) problemMarkets.push('MK-HS');
        if (vkhs.amm.oracleSlotDelayOverride !== -1) problemMarkets.push('VK-HS');
        
        if (problemMarkets.length > 0) {
            console.log("❌ ISSUE CONFIRMED:");
            console.log(`${problemMarkets.join(' and ')} ${problemMarkets.length === 1 ? 'does' : 'do'} NOT have permissive oracle settings.`);
            console.log("These markets use standard oracle staleness checks.");
            console.log("The UI needs to be updated to either:");
            console.log("1. Add these markets to the permissive list, OR");
            console.log("2. Apply oracle slot delay override of -1 to these markets");
        } else {
            console.log("✅ All markets have permissive oracle settings");
        }

        await driftClient.unsubscribe();

    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

checkMKHSAndVKHS().catch(console.error); 