const  cron = require ('node-cron');
const poolPromise = require('../config/db').poolPromise;
const sql = require('../config/db').sql;
//  



/**
 * Cron job to check and mark expired permits.
 * 
 * Runs every hour to find permits that:
 * - Are NOT in 'Close' or 'Closer Pending' status
 * - Have PermitValidUpTo date in the past (up to current date/time)
 * - Are not already marked as expired
 * 
 * Updates:
 * - PermitMaster.IsExpired = 1 (true)
 * - UserPermitMaster.CurrentPermitStatus = 'Expired'
 */
const startExpirePermitsCron = () => {
    // Run every hour at minute 0 (e.g., 10:00, 11:00, 12:00, etc.)
    const job = cron.schedule('0 * * * *', async () => {
        try {
            console.log(`[Cron] Starting expired permits check at ${new Date().toISOString()}`);
            
            const pool = await poolPromise;
            
            // Find permits that are expired and not yet marked as such
            const result = await pool.request()
                .input('Now', sql.DateTime, new Date())
                .query(`
                    SELECT pm.PermitId, pm.IsExpired, upm.CurrentPermitStatus
                    FROM PermitMaster pm
                    INNER JOIN UserPermitMaster upm ON pm.PermitId = upm.PermitId
                    INNER JOIN HeightWorkPermit hwp ON pm.PermitId = hwp.PermitId
                    WHERE upm.IsActive = 1 
                      AND upm.DelMark = 0
                      AND pm.IsExpired = 0
                      AND UPPER(upm.CurrentPermitStatus) NOT IN ('CLOSE', 'CLOSER PENDING')
                      AND hwp.PermitValidUpTo < @Now
                    UNION ALL
                    SELECT pm.PermitId, pm.IsExpired, upm.CurrentPermitStatus
                    FROM PermitMaster pm
                    INNER JOIN UserPermitMaster upm ON pm.PermitId = upm.PermitId
                    INNER JOIN HotWorkPermit hwp ON pm.PermitId = hwp.PermitId
                    WHERE upm.IsActive = 1 
                      AND upm.DelMark = 0
                      AND pm.IsExpired = 0
                      AND UPPER(upm.CurrentPermitStatus) NOT IN ('CLOSE', 'CLOSER PENDING')
                      AND hwp.PermitValidUpTo < @Now
                    UNION ALL
                    SELECT pm.PermitId, pm.IsExpired, upm.CurrentPermitStatus
                    FROM PermitMaster pm
                    INNER JOIN UserPermitMaster upm ON pm.PermitId = upm.PermitId
                    INNER JOIN ElectricWorkPermit ewp ON pm.PermitId = ewp.PermitId
                    WHERE upm.IsActive = 1 
                      AND upm.DelMark = 0
                      AND pm.IsExpired = 0
                      AND UPPER(upm.CurrentPermitStatus) NOT IN ('CLOSE', 'CLOSER PENDING')
                      AND ewp.PermitValidUpTo < @Now
                    UNION ALL
                    SELECT pm.PermitId, pm.IsExpired, upm.CurrentPermitStatus
                    FROM PermitMaster pm
                    INNER JOIN UserPermitMaster upm ON pm.PermitId = upm.PermitId
                    INNER JOIN GeneralWorkPermit gwp ON pm.PermitId = gwp.PermitId
                    WHERE upm.IsActive = 1 
                      AND upm.DelMark = 0
                      AND pm.IsExpired = 0
                      AND UPPER(upm.CurrentPermitStatus) NOT IN ('CLOSE', 'CLOSER PENDING')
                      AND gwp.PermitValidUpTo < @Now
                `);
            
            if (result.recordset && result.recordset.length > 0) {
                console.log(`[Cron] Found ${result.recordset.length} expired permit(s) to update`);
                
                const expiredPermitIds = [...new Set(result.recordset.map(r => r.PermitId))];
                
                // Update PermitMaster and UserPermitMaster for each expired permit
                for (const permitId of expiredPermitIds) {
                    try {
                        // Update PermitMaster.IsExpired = 1
                        await pool.request()
                            .input('PermitId', sql.Int, permitId)
                            .query('UPDATE PermitMaster SET IsExpired = 1 WHERE PermitId = @PermitId');
                        
                        // Update UserPermitMaster.CurrentPermitStatus = 'Expired'
                        await pool.request()
                            .input('PermitId', sql.Int, permitId)
                            .query("UPDATE UserPermitMaster SET CurrentPermitStatus = 'Expired' WHERE PermitId = @PermitId");
                        
                        console.log(`[Cron] ✓ Marked permit ${permitId} as expired`);
                    } catch (e) {
                        console.error(`[Cron] ✗ Failed to update permit ${permitId}:`, e.message || e);
                    }
                }
                
                console.log(`[Cron] Expired permits check completed successfully. Updated ${expiredPermitIds.length} permit(s)`);
            } else {
                console.log(`[Cron] No expired permits found`);
            }
        } catch (error) {
            console.error(`[Cron] Error in expirePermitsCron:`, error.message || error);
        }
    });
    
    console.log('[Cron] Expired permits cron job initialized (runs hourly at :00)');
    return job;
};
module.exports = { startExpirePermitsCron };
