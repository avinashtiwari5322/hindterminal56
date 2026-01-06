// API: Approve a permit (set CurrentPermitStatus to Approved and update Approver details in the specific table)
const approvePermit = async (req, res) => {
    try {
        const { PermitTypeId, PermitId, UserId } = req.body;
        const pool = await poolPromise;

        if (!PermitTypeId || isNaN(PermitTypeId)) {
            return res.status(400).json({ error: 'Valid PermitTypeId is required' });
        }
        if (!PermitId || isNaN(PermitId)) {
            return res.status(400).json({ error: 'Valid PermitId is required' });
        }
        if (!UserId || isNaN(UserId)) {
            return res.status(400).json({ error: 'Valid UserId is required' });
        }

        const tableMap = {
            1: 'HeightWorkPermit',
            2: 'HotWorkPermit',
            3: 'ElectricWorkPermit',
            4: 'GeneralWorkPermit'
        };

        const tableName = tableMap[PermitTypeId];
        if (!tableName) {
            return res.status(400).json({ error: 'Invalid PermitTypeId' });
        }

        // We'll store only the approver's user id and the approval timestamp.
        const currentDateTime = new Date();
        const approverUpdatedBy = UserId ? String(UserId) : null;

        // Update CurrentPermitStatus to 'Approved' in UserPermitMaster
        const updateResult = await pool.request()
            .input('PermitId', sql.Int, PermitId)
            .query("UPDATE UserPermitMaster SET CurrentPermitStatus = 'Approved' WHERE PermitId = @PermitId");

        if (updateResult.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Permit not found' });
        }

        // Update Approver metadata (only user id and timestamp) in the specific permit table
        await pool.request()
            .input('PermitId', sql.Int, PermitId)
            .input('Approver_DateTime', sql.DateTime, currentDateTime)
            .input('Approver_UpdatedBy', sql.NVarChar(100), approverUpdatedBy)
            .query(`
                UPDATE ${tableName} SET 
                    Approver_DateTime = @Approver_DateTime,
                    Approver_UpdatedBy = @Approver_UpdatedBy
                WHERE PermitId = @PermitId
            `);

        // Get permit details
const permitResult = await pool.request()
    .input('PermitId', sql.Int, PermitId)
    .query(`
        SELECT 
            pm.PermitNumber, 
            wp.WorkLocation, 
            wp.WorkDescription, 
            issuer.MailId AS IssuerEmail, 
            receiver.MailId AS ReceiverEmail, 
            reviewer.MailId AS ReviewerEmail, 
            approver.MailId AS ApproverEmail, 
            approver.Name AS ApproverName
        FROM ${tableName} wp
        INNER JOIN PermitMaster pm ON wp.PermitId = pm.PermitId
        LEFT JOIN UserMaster issuer ON wp.Issuer_UpdatedBy = CAST(issuer.UserId AS NVARCHAR(100))
        LEFT JOIN UserMaster receiver ON wp.Receiver_UpdatedBy = CAST(receiver.UserId AS NVARCHAR(100))
        LEFT JOIN UserMaster reviewer ON wp.Reviewer_UpdatedBy = CAST(reviewer.UserId AS NVARCHAR(100))
        LEFT JOIN UserMaster approver ON wp.Approver_UpdatedBy = CAST(approver.UserId AS NVARCHAR(100))
        WHERE wp.PermitId = @PermitId
    `);

if (permitResult.recordset.length === 0) {
    return res.status(404).json({ error: 'Permit details not found' });
}

const permit = permitResult.recordset[0];

// Collect all valid emails (remove null, undefined, empty strings)
const recipientEmails = [
    permit.ReceiverEmail,
    permit.IssuerEmail,
    permit.ReviewerEmail,
    permit.ApproverEmail
].filter(email => email && email.trim() !== '').map(email => email.trim());

if (recipientEmails.length === 0) {
    console.warn(`No valid email addresses found for PermitId: ${PermitId}`);
    // Continue without failing, or return error if email is mandatory
}

// Common HTML template
const getEmailHtml = () => `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9; }
            h2 { color: #2c3e50; }
            strong { color: #2c3e50; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Work Permit Approved</h2>
            <p>Dear Team Member,</p>
            <p>The following work permit has been <strong>approved</strong>:</p>
            
            <p><strong>Permit Number:</strong> ${permit.PermitNumber}</p>
            <p><strong>Location:</strong> ${permit.WorkLocation || 'N/A'}</p>
            <p><strong>Work Description:</strong> ${permit.WorkDescription || 'N/A'}</p>
            <p><strong>Approved By:</strong> ${permit.ApproverName || 'Unknown'}</p>
            <p><strong>Approval Date/Time:</strong> ${currentDateTime.toLocaleString()}</p>
            
            <p>Please log in to the system to review the full permit details.</p>
            <p>Thank you.<br><em>Work Permit System</em></p>
        </div>
    </body>
    </html>
`;

// Send individual email to each recipient
const emailPromises = recipientEmails.map(async (email) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `Work Permit ${permit.PermitNumber} Has Been Approved`,
        html: getEmailHtml()
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Approval email sent to: ${email}`);
    } catch (error) {
        console.error(`Failed to send email to ${email}:`, error);
    }
});

// Wait for all emails to be sent (fire-and-forget if you don't want to block)
 Promise.all(emailPromises);

        res.json({ 
            message: 'Permit has been approved and notification emails have been sent',
            permitId: PermitId,
            approvedBy: approverUpdatedBy,
            approvalDateTime: currentDateTime
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to approve permit: ' + error.message });
    }
};

// API: Close a permit (set CurrentPermitStatus to Close or Closer Pending depending on user role)
const closePermit = async (req, res) => {
    try {
        const { PermitTypeId, PermitId, UserId } = req.body;
        const pool = await poolPromise;

        if (!PermitTypeId || isNaN(PermitTypeId)) {
            return res.status(400).json({ error: 'Valid PermitTypeId is required' });
        }

        const tableMap = {
            1: 'HeightWorkPermit',
            2: 'HotWorkPermit',
            3: 'ElectricWorkPermit',
            4: 'GeneralWorkPermit'
        };

        const tableName = tableMap[PermitTypeId];
        if (!tableName) {
            return res.status(400).json({ error: 'Invalid PermitTypeId' });
        }

        // Validate PermitId and UserId
        if (!PermitId) return res.status(400).json({ error: 'PermitId is required' });
        if (!UserId) return res.status(400).json({ error: 'UserId is required' });

        // Fetch the role of the user who is trying to close the permit
        const userRow = await pool.request()
            .input('UserId', sql.Int, UserId)
            .query('SELECT UserId, RoleId, MailId FROM UserMaster WHERE UserId = @UserId AND IsActive = 1 AND DelMark = 0');

        if (userRow.recordset.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userRow.recordset[0];
        const roleId = user.RoleId;

        // Role-based status: if superadmin (RoleId=4) -> Close, otherwise -> Closer Pending
        const newStatus = (roleId === 4) ? 'Close' : 'Closer Pending';

        // Update CurrentPermitStatus accordingly in UserPermitMaster
        const updateResult = await pool.request()
            .input('PermitId', sql.Int, PermitId)
            .input('CurrentPermitStatus', sql.NVarChar(50), newStatus)
            .query("UPDATE UserPermitMaster SET CurrentPermitStatus = @CurrentPermitStatus WHERE PermitId = @PermitId");

        if (updateResult.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Permit not found' });
        }

        // Accept multiple files in field 'files'
        // if (!req.files || req.files.length === 0) {
        //     return res.status(400).json({ error: 'At least one file is required.' });
        // }

        // Insert each uploaded file into PermitCloseAttachment (one row per file)
        for (const file of req.files) {
            const docInfo = [{
                originalName: file.originalname,
                size: file.size,
                mimetype: file.mimetype
            }];

            await pool.request()
                .input('PermitId', sql.Int, PermitId)
                .input('Documents', sql.NVarChar(sql.MAX), JSON.stringify(docInfo))
                .input('FileData', sql.VarBinary(sql.MAX), file.buffer)
                .input('CreatedBy', sql.NVarChar(100), UserId.toString())
                .input('IsActive', sql.Bit, true)
                .input('DelMark', sql.Bit, false)
                .input('CreatedOn', sql.DateTime, new Date())
                .query(`
                    INSERT INTO PermitCloseAttachment (PermitId, Documents, FileData, CreatedBy, IsActive, DelMark, CreatedOn)
                    VALUES (@PermitId, @Documents, @FileData, @CreatedBy, @IsActive, @DelMark, @CreatedOn)
                `);
        }

        // Record close action in PermitCloseStatus table (insert or update)
        try {
            // Map RoleId to the corresponding columns in PermitCloseStatus
            const roleCloseMap = {
                1: { timeCol: 'IssuerCloseTime', userCol: 'IssuerClosedBy' },
                2: { timeCol: 'ReceiverCloseTime', userCol: 'ReceiverClosedBy' },
                3: { timeCol: 'ReviewerCloseTime', userCol: 'ReviewerClosedBy' },
                4: { timeCol: 'ApproverCloseTime', userCol: 'ApproverClosedBy' },
                5: { timeCol: 'IsolationCloseTime', userCol: 'IsolationClosedBy' }
            };

            const cols = roleCloseMap[roleId];
            if (cols) {
                // Use Indian Standard Time for the timestamp
                const nowIst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

                // Check if a PermitCloseStatus row exists for this PermitId
                const pcsExist = await pool.request()
                    .input('PermitId', sql.Numeric(18, 0), PermitId)
                    .query('SELECT PermitCloseStatusId FROM PermitCloseStatus WHERE PermitId = @PermitId');

                if (pcsExist.recordset.length > 0) {
                    // Update the appropriate close columns
                    const updateSql = `UPDATE PermitCloseStatus SET ${cols.timeCol} = @CloseTime, ${cols.userCol} = @ClosedBy WHERE PermitId = @PermitId`;
                    await pool.request()
                        .input('PermitId', sql.Numeric(18, 0), PermitId)
                        .input('CloseTime', sql.DateTime, nowIst)
                        .input('ClosedBy', sql.Numeric(18, 0), UserId)
                        .query(updateSql);
                } else {
                    // Insert a new row with the appropriate close columns set
                    const insertSql = `INSERT INTO PermitCloseStatus (PermitId, ${cols.timeCol}, ${cols.userCol}, IsActive, Delmark, CreatedOn, CreatedBy) VALUES (@PermitId, @CloseTime, @ClosedBy, 'Y', 'N', @CreatedOn, @CreatedBy)`;
                    await pool.request()
                        .input('PermitId', sql.Numeric(18, 0), PermitId)
                        .input('CloseTime', sql.DateTime, nowIst)
                        .input('ClosedBy', sql.Numeric(18, 0), UserId)
                        .input('CreatedOn', sql.DateTime, nowIst)
                        .input('CreatedBy', sql.Numeric(18, 0), UserId)
                        .query(insertSql);
                }
            }
        } catch (e) {
            console.error('Failed to update PermitCloseStatus:', e && e.message ? e.message : e);
            // do not block the main flow if this fails
        }

        // Determine recipients based on the role of the user who closed the permit
        // Mapping: filler(1)->user(2), user(2)->admin(3), isolation(5)->admin(3), admin(3)->superadmin(4)
        const recipientRoleMap = {
            1: 2,
            2: 3,
            5: 3,
            3: 4
        };

        const targetRoleId = recipientRoleMap[roleId];
        let recipients = [];

        if (targetRoleId) {
            const recipientsResult = await pool.request()
                .input('RoleId', sql.Int, targetRoleId)
                .query('SELECT MailId FROM UserMaster WHERE RoleId = @RoleId AND IsActive = 1 AND DelMark = 0 AND MailId IS NOT NULL');

            recipients = recipientsResult.recordset.map(r => r.MailId).filter(Boolean);
        }
        // If no recipients found, fall back to default stakeholders
        if (!recipients || recipients.length === 0) {
            recipients = [
                
                'avinashtiwari5322@gmail.com'
            ];
        }

        // Get permit details for the email
        const permitResult = await pool.request()
            .input('PermitId', sql.Int, PermitId)
            .query(`
                SELECT pm.PermitNumber, wp.WorkLocation, wp.WorkDescription 
                FROM ${tableName} wp
                INNER JOIN PermitMaster pm ON wp.PermitId = pm.PermitId
                WHERE wp.PermitId = @PermitId
            `);

        if (permitResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Permit details not found' });
        }

        const permit = permitResult.recordset[0];

        // Send email notification to resolved recipients
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: recipients.join(','),
            subject: `Work Permit ${permit.PermitNumber} ${newStatus === 'Close' ? 'Closed' : 'Closer Pending'}`,
            html: `
                <h2>Work Permit Status Updated</h2>
                <p><strong>Permit Number:</strong> ${permit.PermitNumber}</p>
                <p><strong>Location:</strong> ${permit.WorkLocation}</p>
                <p><strong>Work Description:</strong> ${permit.WorkDescription}</p>
                <p><strong>Updated By:</strong> ${user.MailId || 'Unknown'}</p>
                <p><strong>New Status:</strong> ${newStatus}</p>
                <p>Please review the permit details in the system.</p>
            `
        };

        await transporter.sendMail(mailOptions);

        res.json({ 
            message: `Permit status updated to '${newStatus}' and notification emails have been sent`,
            permitId: PermitId,
            newStatus
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to close permit: ' + error.message });
    }
};
// GET: Serve admin document from PermitAdminAttachment by PermitId
const getAdminDocumentByPermitId = async (req, res) => {
    try {
        const { permitId } = req.params;
        const permitIdNumber = parseInt(permitId, 10);
        if (isNaN(permitIdNumber) || permitIdNumber <= 0) {
            return res.status(400).json({ error: 'Invalid PermitId. Must be a positive number.' });
        }

        const pool = await poolPromise;
        // Get the first active, non-deleted admin document for this permit, including file data
        const result = await pool.request()
            .input('PermitId', sql.Int, permitIdNumber)
            .query('SELECT TOP 1 Documents, FileData FROM PermitAdminAttachment WHERE PermitId = @PermitId AND IsActive = 1 AND DelMark = 0');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Admin document not found' });
        }

        // Documents is a JSON array, get the first file info
        let docArr;
        try {
            docArr = JSON.parse(result.recordset[0].Documents);
        } catch (e) {
            return res.status(500).json({ error: 'Invalid document format' });
        }
        if (!Array.isArray(docArr) || docArr.length === 0) {
            return res.status(404).json({ error: 'No admin document found' });
        }
        const doc = docArr[0];
        const fileData = result.recordset[0].FileData;
        if (!fileData) {
            return res.status(404).json({ error: 'No file data found for admin document' });
        }

        res.setHeader('Content-Type', doc.mimetype || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${doc.originalName || 'admin-document'}"`);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.send(fileData);
    } catch (error) {
        console.error('Error serving admin document:', error);
        res.status(500).json({ error: 'Failed to serve admin document' });
    }
};
// POST: Add admin document to PermitAdminAttachment
const uploadAdminDocument = async (req, res) => {
    try {
        const { PermitId, UserId } = req.body;
        if (!PermitId || !UserId) {
            return res.status(400).json({ error: 'PermitId and UserId are required.' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'File is required.' });
        }

        // Prepare document info as JSON array (can be extended for multiple files)
        const docInfo = [{
            originalName: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype
        }];

        const pool = await poolPromise;
        await pool.request()
            .input('PermitId', sql.Int, PermitId)
            .input('Documents', sql.NVarChar(sql.MAX), JSON.stringify(docInfo))
            .input('FileData', sql.VarBinary(sql.MAX), req.file.buffer)
            .input('CreatedBy', sql.NVarChar(100), UserId.toString())
            .query(`
                INSERT INTO PermitAdminAttachment (PermitId, Documents, FileData, CreatedBy)
                VALUES (@PermitId, @Documents, @FileData, @CreatedBy)
            `);

        res.status(201).json({ success: true, message: 'Admin document uploaded successfully.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to upload admin document.' });
    }
};
const multer = require('multer'); 
const path = require('path');
const fs = require('fs');
const { poolPromise, sql } = require('../config/db');
const transporter = require('../config/mailer');

// Create uploads directory if it doesn't exist
const uploadsDir = 'uploads/permits';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file upload
const storage = multer.memoryStorage();

// File filter to allow only specific file types
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (jpeg, png, gif, webp) are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 4 * 1024 * 1024, // 4MB limit
        files: 10 // Maximum 10 files
    }
});

const savePermit = async (req, res) => {
    console.log('DEBUG req.files:', req.files);
    console.log('DEBUG req.body:', req.body);
    try {
        const {
            PermitTypeId,
            PermitNumber,
            UserId,
            Location,
            PermitDate,
            NearestFireAlarmPoint,
            TotalEngagedWorkers,
            WorkLocation,
            WorkDescription,
            PermitValidUpTo,
            Organization,
            SupervisorName,
            ContactNumber,
            Reason,
            AdditionalPpe,
            Issuer_Name,
            Issuer_Designation,
            Issuer_DateTime,
            Receiver_Name,
            Receiver_Designation,
            Receiver_DateTime,
            EnergyIsolate_Name,
            EnergyIsolate_Designation,
            EnergyIsolate_DateTime,
            Reviewer_Name,
            Reviewer_Designation,
            Reviewer_DateTime,
            Approver_Name,
            Approver_Designation,
            Approver_DateTime,
            IsolationRequired,
            Created_by,
            ReferencePermitId,
            DepartmentId,
            AlarmPointId,
            WorkLocationId
        } = req.body;
        const pool = await poolPromise;
        const uploadedFiles = req.files || [];
        const filesData = uploadedFiles.map(file => ({
            originalName: file.originalname,
            size: file.size,
            mimetype: file.mimetype
        }));
        const intDepartmentId = parseInt(DepartmentId, 10);
        const intAlarmPointId = parseInt(AlarmPointId, 10);
        const intWorkLocationId = parseInt(WorkLocationId, 10);
        const permitTypeId = parseInt(req.body.PermitTypeId, 10);
        if (isNaN(permitTypeId) || permitTypeId <= 0) {
            console.error('Invalid PermitTypeId:', req.body.PermitTypeId);
            return res.status(400).json({ error: 'Invalid PermitTypeId. It must be a positive number.' });
        }

        // Ensure PermitTypeId exists in PermitTypeMaster
        const permitTypeCheck = await pool.request()
            .input('PermitTypeId', sql.Numeric(18, 0), permitTypeId)
            .query('SELECT PermitTypeId FROM PermitTypeMaster WHERE PermitTypeId = @PermitTypeId AND IsActive = 1 AND DelMark = 0');

        if (permitTypeCheck.recordset.length === 0) {
            console.error('PermitTypeId does not exist in PermitTypeMaster:', permitTypeId);
            return res.status(400).json({ error: 'Invalid PermitTypeId. It does not exist in the database.' });
        }

        if (!permitTypeId || !UserId) {
            return res.status(400).json({ error: 'PermitTypeId and UserId are required.' });
        }

        
        // Insert into PermitMaster
        // Generate server-side PermitNumber in format: HTPL/<LOCATION_IN_CAPS>/<YYYY-YY>/<seq>
        // Use WorkLocation if provided, otherwise Location, fallback to 'UNKNOWN'
        const rawLocation = (Location ).toString().trim();
        // Normalize location: remove quotes/slashes and collapse whitespace, make uppercase
        const locNorm = rawLocation.replace(/["'\\/]/g, '').replace(/\s+/g, '').toUpperCase();

        // Fiscal year like 2025-26: if month >= Apr (4) use current year as start, else previous year
        const now = new Date();
        const month = now.getMonth() + 1; // 1-12
        let startYear = now.getFullYear();
        if (month < 4) startYear = startYear - 1;
        const endYear = startYear + 1;
        const fiscal = `${startYear}-${String(endYear).slice(-2)}`; // e.g. 2025-26

        const prefix = `HTPL/${locNorm}/${fiscal}/`;

        // Find latest numeric suffix for this prefix and increment. Ensure uniqueness by checking existence.
        let nextSeq = 1;
        try {
            const existing = await pool.request()
                .input('LikePattern', sql.NVarChar(200), prefix + '%')
                .query('SELECT PermitNumber FROM PermitMaster WHERE PermitNumber LIKE @LikePattern ORDER BY PermitId DESC');

            if (existing.recordset && existing.recordset.length > 0) {
                // try to extract numeric suffix from the latest PermitNumber
                for (const row of existing.recordset) {
                    const pn = row.PermitNumber || '';
                    const parts = pn.split('/');
                    const last = parts[parts.length - 1];
                    const num = parseInt((last || '').replace(/^0+/, ''), 10);
                    if (!isNaN(num) && num >= nextSeq) {
                        nextSeq = num + 1;
                        break;
                    }
                }
            }
        } catch (e) {
            console.error('Error fetching existing PermitNumbers for generation:', e && e.message ? e.message : e);
            // fallback: nextSeq remains 1
        }

        // Ensure generated PermitNumber is unique (defensive loop)
        let generatedPermitNumber = `${prefix}${nextSeq}`;
        try {
            let exists = true;
            let guard = 0;
            while (exists && guard < 50) {
                const check = await pool.request()
                    .input('PermitNumber', sql.NVarChar(200), generatedPermitNumber)
                    .query('SELECT PermitId FROM PermitMaster WHERE PermitNumber = @PermitNumber');
                if (check.recordset && check.recordset.length > 0) {
                    nextSeq += 1;
                    generatedPermitNumber = `${prefix}${nextSeq}`;
                    guard += 1;
                } else {
                    exists = false;
                }
            }
            if (guard >= 50) console.warn('PermitNumber generation hit guard limit');
        } catch (e) {
            console.error('Error ensuring PermitNumber uniqueness:', e && e.message ? e.message : e);
        }

        // Validate and process ReferencePermitId if provided
        let referencePermitId = null;
        if (ReferencePermitId && !isNaN(parseInt(ReferencePermitId, 10))) {
            const refPmtId = parseInt(ReferencePermitId, 10);
            // Verify the reference permit exists
            const refCheck = await pool.request()
                .input('PermitId', sql.Int, refPmtId)
                .query('SELECT PermitId FROM PermitMaster WHERE PermitId = @PermitId');
            if (refCheck.recordset.length > 0) {
                referencePermitId = refPmtId;
            }
        }

        // Determine IsReopened: true if ReferencePermitId exists and is valid, false otherwise
        const isReopened = referencePermitId !== null ? 1 : 0;

        // Insert into PermitMaster using generated permit number
        const permitMasterResult = await pool.request()
            .input('PermitTypeId', sql.Numeric(18, 0), PermitTypeId)
            .input('PermitNumber', sql.NVarChar(100), generatedPermitNumber)
            .input('CreatedBy', sql.NVarChar(100), UserId)
            .input('ReferencePermitId', sql.Int, referencePermitId)
            .input('IsReopened', sql.Bit, isReopened)
            .query(`
                INSERT INTO PermitMaster (PermitTypeId, PermitNumber, CreatedBy, ReferencePermitId, IsReopened)
                OUTPUT INSERTED.PermitId
                VALUES (@PermitTypeId, @PermitNumber, @CreatedBy, @ReferencePermitId, @IsReopened)
            `);

        const PermitId = permitMasterResult.recordset[0].PermitId;

        // Insert into specific permit table based on PermitTypeId
        let specificTableQuery = '';
        switch (PermitTypeId) {
            case "1": // HeightWorkPermit
                specificTableQuery = `
                    INSERT INTO HeightWorkPermit (
                        PermitId, PermitDate, NearestFireAlarmPoint, TotalEngagedWorkers, WorkLocation, 
                        WorkDescription, PermitValidUpTo, Organization, SupervisorName, ContactNumber,IsolationRequired, Created_by, DepartmentId, AlarmPointId, WorkLocationId
                    ) VALUES (
                        @PermitId, @PermitDate, @NearestFireAlarmPoint, @TotalEngagedWorkers, @WorkLocation, 
                        @WorkDescription, @PermitValidUpTo, @Organization, @SupervisorName, @ContactNumber,@IsolationRequired, @CreatedBy, @DepartmentId, @AlarmPointId, @WorkLocationId
                    )`;
                break;
            case "2": // HotWorkPermit
                specificTableQuery = `
                    INSERT INTO HotWorkPermit (
                        PermitId, PermitDate, NearestFireAlarmPoint, TotalEngagedWorkers, WorkLocation, 
                        WorkDescription, PermitValidUpTo, Organization, SupervisorName, ContactNumber,IsolationRequired, Created_by, DepartmentId, AlarmPointId, WorkLocationId
                    ) VALUES (
                        @PermitId, @PermitDate, @NearestFireAlarmPoint, @TotalEngagedWorkers, @WorkLocation, 
                        @WorkDescription, @PermitValidUpTo, @Organization, @SupervisorName, @ContactNumber,@IsolationRequired, @CreatedBy, @DepartmentId, @AlarmPointId, @WorkLocationId
                    )`;
                break;
            case "3": // ElectricWorkPermit
                specificTableQuery = `
                    INSERT INTO ElectricWorkPermit (
                        PermitId, PermitDate, NearestFireAlarmPoint, TotalEngagedWorkers, WorkLocation, 
                        WorkDescription, PermitValidUpTo, Organization, SupervisorName, ContactNumber,IsolationRequired, Created_by, DepartmentId, AlarmPointId, WorkLocationId
                    ) VALUES (
                        @PermitId, @PermitDate, @NearestFireAlarmPoint, @TotalEngagedWorkers, @WorkLocation, 
                        @WorkDescription, @PermitValidUpTo, @Organization, @SupervisorName, @ContactNumber,@IsolationRequired, @CreatedBy, @DepartmentId, @AlarmPointId, @WorkLocationId
                    )`;
                break;
            case "4": // GeneralWorkPermit
                specificTableQuery = `
                    INSERT INTO GeneralWorkPermit (
                        PermitId, PermitDate, NearestFireAlarmPoint, TotalEngagedWorkers, WorkLocation, 
                        WorkDescription, PermitValidUpTo, Organization, SupervisorName, ContactNumber, IsolationRequired, Created_by, DepartmentId, AlarmPointId, WorkLocationId
                    ) VALUES (
                        @PermitId, @PermitDate, @NearestFireAlarmPoint, @TotalEngagedWorkers, @WorkLocation, 
                        @WorkDescription, @PermitValidUpTo, @Organization, @SupervisorName, @ContactNumber, @IsolationRequired, @CreatedBy, @DepartmentId, @AlarmPointId, @WorkLocationId
                    )`;
                break;
            default:
                return res.status(400).json({ error: 'Invalid PermitTypeId.' });
        }

        await pool.request()
            .input('PermitId', sql.Numeric(18, 0), PermitId)
            .input('PermitDate', sql.DateTime, PermitDate)
            .input('NearestFireAlarmPoint', sql.NVarChar(255), NearestFireAlarmPoint)
            .input('TotalEngagedWorkers', sql.Int, TotalEngagedWorkers)
            .input('WorkLocation', sql.NVarChar(255), WorkLocation)
            .input('WorkDescription', sql.NVarChar(sql.MAX), WorkDescription)
            .input('PermitValidUpTo', sql.DateTime, PermitValidUpTo)
            .input('Organization', sql.NVarChar(255), Organization)
            .input('SupervisorName', sql.NVarChar(255), SupervisorName)
            .input('ContactNumber', sql.NVarChar(50), ContactNumber)
            .input('Reason', sql.NVarChar(500), Reason)
            .input('AdditionalPpe', sql.NVarChar(500), AdditionalPpe)
            .input('Issuer_Name', sql.NVarChar(100), Created_by)
            .input('Issuer_Designation', sql.NVarChar(100), Issuer_Designation)
            .input('Issuer_DateTime', sql.DateTime, Issuer_DateTime)
            .input('Receiver_Name', sql.NVarChar(100), Receiver_Name)
            .input('Receiver_Designation', sql.NVarChar(100), Receiver_Designation)
            .input('Receiver_DateTime', sql.DateTime, Receiver_DateTime)
            .input('EnergyIsolate_Name', sql.NVarChar(100), EnergyIsolate_Name)
            .input('EnergyIsolate_Designation', sql.NVarChar(100), EnergyIsolate_Designation)
            .input('EnergyIsolate_DateTime', sql.DateTime, EnergyIsolate_DateTime)
            .input('Reviewer_Name', sql.NVarChar(100), Reviewer_Name)
            .input('Reviewer_Designation', sql.NVarChar(100), Reviewer_Designation)
            .input('Reviewer_DateTime', sql.DateTime, Reviewer_DateTime)
            .input('Approver_Name', sql.NVarChar(100), Approver_Name)
            .input('Approver_Designation', sql.NVarChar(100), Approver_Designation)
            .input('CreatedBy', sql.NVarChar(100), Created_by)
            .input('Approver_DateTime', sql.DateTime, Approver_DateTime)
            .input('IsolationRequired', sql.Bit, IsolationRequired === 'true' ? 1 : 0)
            .input('DepartmentId', sql.Int, intDepartmentId)
            .input('AlarmPointId', sql.Int, intAlarmPointId)
            .input('WorkLocationId', sql.Int, intWorkLocationId)
            .query(specificTableQuery);

        // After inserting the specific permit row, store the issuer's user id and timestamp
        // so getPermitById can resolve it into a user object later.
        try {
            const currentDateTime = new Date();
            const issuerUpdatedBy = UserId ? String(UserId) : null;
            const tableMapForIssuer = {
                1: 'HeightWorkPermit',
                2: 'HotWorkPermit',
                3: 'ElectricWorkPermit',
                4: 'GeneralWorkPermit'
            };
            const targetTable = tableMapForIssuer[permitTypeId];
            if (targetTable) {
                await pool.request()
                    .input('PermitId', sql.Int, PermitId)
                    .input('Issuer_DateTime', sql.DateTime, currentDateTime)
                    .input('Issuer_UpdatedBy', sql.NVarChar(100), issuerUpdatedBy)
                    .query(`UPDATE ${targetTable} SET Issuer_DateTime = @Issuer_DateTime, Issuer_UpdatedBy = @Issuer_UpdatedBy WHERE PermitId = @PermitId`);
            }
        } catch (e) {
            console.error('Error setting Issuer_UpdatedBy for permit:', e && e.message ? e.message : e);
        }

        // Update UserPermitMaster
        await pool.request()
            .input('UserId', sql.Int, UserId)
            .input('PermitId', sql.Numeric(18, 0), PermitId)
            .input('CurrentPermitStatus', sql.NVarChar(50), 'Active')
            .input('Status', sql.NVarChar(50), 'Pending')
            .input('IsActive', sql.Bit, true)
            .input('DelMark', sql.Bit, false)
            .query(`
                INSERT INTO UserPermitMaster (UserId, PermitId, CurrentPermitStatus, Status, IsActive, DelMark)
                VALUES (@UserId, @PermitId, @CurrentPermitStatus, @Status, @IsActive, @DelMark)
            `);

        if (uploadedFiles.length > 0) {
            for (const file of uploadedFiles) {
                await pool.request()
                    .input('PermitID', sql.Int, PermitId)
                    .input('FileName', sql.NVarChar(255), file.originalname)
                    .input('FileSize', sql.BigInt, file.size)
                    .input('FileType', sql.NVarChar(100), file.mimetype)
                    .input('FileData', sql.VarBinary(sql.MAX), file.buffer)
                    .input('UploadDate', sql.DateTime, new Date())
                    .query(`
                        INSERT INTO PERMIT_FILES (PermitID, FileName, FileSize, FileType, FileData, UploadDate)
                        VALUES (@PermitID, @FileName, @FileSize, @FileType, @FileData, @UploadDate)
                    `);
            }
        }


        res.status(201).json({ 
            message: 'Permit saved successfully',
            permitId: PermitId,
            uploadedFiles: filesData.length
        });

    } catch (error) {
        console.error('Error saving permit:', error);
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }

        res.status(500).json({ error: 'Failed to save permit.' });
    }
};

// Get permits by user
const getPermitsByUser = async (req, res) => {
    try {
        const { UserId } = req.query;
        console.log('DEBUG UserId:', UserId);
        // Validate UserId
        if (!UserId || isNaN(UserId)) {
            return res.status(400).json({ error: 'Valid UserId is required' });
        }

        const pool = await poolPromise;

        // Check if UserId exists in UserMaster
        const userCheck = await pool.request()
            .input('UserId', sql.Int, UserId)
            .query('SELECT UserId FROM UserMaster WHERE UserId = @UserId');
        
        if (userCheck.recordset.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get permits for the user
        const permitsResult = await pool.request()
            .input('UserId', sql.Int, UserId)
            .query(`
                SELECT p.*, 
                       upm.CurrentPermitStatus,
                       upm.Status as PermitStatus,
                       ptm.PermitType,
                       (SELECT COUNT(*) FROM PERMIT_FILES f WHERE f.PermitID = p.PermitId) as FileCount
                FROM PermitMaster p
                INNER JOIN UserPermitMaster upm ON p.PermitID = upm.PermitId
                INNER JOIN PermitTypeMaster ptm ON p.PermitTypeId = ptm.PermitTypeId
                WHERE upm.UserId = @UserId AND upm.IsActive = 1 AND upm.DelMark = 0
                ORDER BY p.CreatedOn DESC
            `);
        
        const permits = [];
        for (const permit of permitsResult.recordset) {
            let detailsQuery = '';
            switch (permit.PermitTypeId) {
                case 1:
                    detailsQuery = `SELECT * FROM HeightWorkPermit WHERE PermitId = @PermitId`;
                    break;
                case 2:
                    detailsQuery = `SELECT * FROM HotWorkPermit WHERE PermitId = @PermitId`;
                    break;
                case 3:
                    detailsQuery = `SELECT * FROM ElectricWorkPermit WHERE PermitId = @PermitId`;
                    break;
                case 4:
                    detailsQuery = `SELECT * FROM GeneralWorkPermit WHERE PermitId = @PermitId`;
                    break;
                default:
                    permit.Files = [];
                    permits.push(permit);
                    continue;
            }
            const detailsResult = await pool.request()
                .input('PermitId', sql.Int, permit.PermitId)
                .query(detailsQuery);
            const details = detailsResult.recordset[0] || {};
            const redundantFields = ['PermitId', 'PermitNumber'];
            for (const key in details) {
                if (details.hasOwnProperty(key) && !redundantFields.includes(key)) {
                    permit[key] = details[key];
                }
            }
            const filesResult = await pool.request()
                .input('PermitId', sql.Int, permit.PermitId)
                .query('SELECT FileID, FileName, FileSize, FileType, UploadDate FROM PERMIT_FILES WHERE PermitID = @PermitId ORDER BY UploadDate DESC');
            permit.Files = filesResult.recordset;

            // --- Add permitReachTo logic (single-stage string) ---
            let reach = null;
            if (String(permit.CurrentPermitStatus) === 'Closer Pending' || String(permit.CurrentPermitStatus) === 'Close') {
                try {
                    const pcsRes = await pool.request()
                        .input('PermitId', sql.Numeric(18, 0), permit.PermitId)
                        .query('SELECT TOP 1 * FROM PermitCloseStatus WHERE PermitId = @PermitId');
                    const pcs = (pcsRes.recordset && pcsRes.recordset[0]) || null;
                    if (pcs) {
                        const order = [
                            { timeCol: 'IssuerCloseTime', name: 'issuer' },
                            { timeCol: 'ReceiverCloseTime', name: 'receiver' },
                            { timeCol: 'ReviewerCloseTime', name: 'reviewer' },
                            { timeCol: 'IsolationCloseTime', name: 'isolation' },
                            { timeCol: 'ApproverCloseTime', name: 'approver' }
                        ];
                        // Determine the most recently closed stage by timestamp (choose latest datetime)
                        let lastClosed = null;
                        let lastClosedTime = null;
                        for (const s of order) {
                            const val = pcs[s.timeCol];
                            if (val) {
                                const t = new Date(val);
                                if (!isNaN(t.getTime())) {
                                    if (!lastClosedTime || t.getTime() > lastClosedTime.getTime()) {
                                        lastClosedTime = t;
                                        lastClosed = s.name;
                                    }
                                }
                            }
                        }
                        if (lastClosed) {
                            reach = lastClosed;
                        } else {
                            // No stage closed yet: return first pending (issuer)
                            reach = 'issuer';
                        }
                    } else {
                        if (permit?.Approver_UpdatedBy) reach = 'approver';
                        else if (permit?.Reviewer_UpdatedBy) reach = 'reviewer';
                        else if (permit?.Receiver_UpdatedBy) reach = 'receiver';
                        else if (permit?.EnergyIsolate_UpdatedBy) reach = 'isolation';
                        else reach = 'issuer';
                    }
                } catch (e) {
                    console.error('Failed to read PermitCloseStatus for permitReachTo (by user):', e && e.message ? e.message : e);
                    if (permit?.Approver_UpdatedBy) reach = 'approver';
                    else if (permit?.Reviewer_UpdatedBy) reach = 'reviewer';
                    else if (permit?.Receiver_UpdatedBy) reach = 'receiver';
                    else if (permit?.EnergyIsolate_UpdatedBy) reach = 'isolation';
                    else reach = 'issuer';
                }
            } else {
                // Determine most recent action among role DateTime fields so isolation is chosen
                // when its DateTime is the latest even if other UpdatedBy flags exist.
                const dtMap = [
                    { col: 'Issuer_DateTime', name: 'issuer' },
                    { col: 'Receiver_DateTime', name: 'receiver' },
                    { col: 'EnergyIsolate_DateTime', name: 'isolation' },
                    { col: 'Reviewer_DateTime', name: 'reviewer' },
                    { col: 'Approver_DateTime', name: 'approver' }
                ];
                let latest = null;
                let latestTime = null;
                for (const d of dtMap) {
                    const val = permit[d.col];
                    if (val) {
                        const t = new Date(val);
                        if (!isNaN(t.getTime())) {
                            if (!latestTime || t.getTime() > latestTime.getTime()) {
                                latestTime = t;
                                latest = d.name;
                            }
                        }
                    }
                }
                if (latest) reach = latest;
                else {
                    // fallback to UpdatedBy flags if no DateTimes available
                    if (permit?.Approver_UpdatedBy) reach = 'approver';
                    else if (permit?.Reviewer_UpdatedBy) reach = 'reviewer';
                    else if (permit?.Receiver_UpdatedBy) reach = 'receiver';
                    else if (permit?.EnergyIsolate_UpdatedBy) reach = 'isolation';
                    else reach = 'issuer';
                }
            }
            permit.permitReachTo = reach;

            permits.push(permit);
        }

        res.json({ data: permits, page, pageSize, total });
    } catch (error) {
        console.error('Error fetching permits:', error);
        res.status(500).json({ error: 'Failed to fetch permits: ' + error.message });
    }
};

// Get all permits
const getPermits = async (req, res) => {
    try {
        // Accept filters from body (POST) or query (GET). Prefer body for POST route.
        const params = req.body && Object.keys(req.body).length ? req.body : req.query || {};
        // Accept common aliases from frontend: UserId or userId, Location or locationId
        const UserId = params.UserId || params.userId || null;
        const Location = params.Location || params.location || params.locationId || params.location_id || null;
        let page = parseInt(params.page, 10) || 1;
        let pageSize = parseInt(params.pageSize, 10) || 20;
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 20;

        const offset = (page - 1) * pageSize;

        const pool = await poolPromise;

        // Build WHERE clause dynamically
        const whereClauses = ['upm.IsActive = 1', 'upm.DelMark = 0'];
        if (UserId && !isNaN(parseInt(UserId, 10))) {
            whereClauses.push('upm.UserId = @UserId');
        }
        // For Location, we'll check type-specific WorkLocation fields using EXISTS
        const locationFilter = Location && String(Location).trim() !== '' ? String(Location).trim() : null;
        let locationExistsSql = '';
        let permitNumberPattern = null;
        if (locationFilter) {
            // normalize location for PermitNumber match (remove slashes/quotes/spaces, uppercase)
            const locNorm = locationFilter.replace(/["'\\/]/g, '').replace(/\s+/g, '').toUpperCase();
            // pattern to match PermitNumber like HTPL/<LOC>/YYYY-YY/%
            permitNumberPattern = `%/${locNorm}/%`;

            locationExistsSql = `(
                EXISTS (SELECT 1 FROM HeightWorkPermit h WHERE h.PermitId = p.PermitId AND h.WorkLocation LIKE @LocationPattern) OR
                EXISTS (SELECT 1 FROM HotWorkPermit h2 WHERE h2.PermitId = p.PermitId AND h2.WorkLocation LIKE @LocationPattern) OR
                EXISTS (SELECT 1 FROM ElectricWorkPermit e WHERE e.PermitId = p.PermitId AND e.WorkLocation LIKE @LocationPattern) OR
                EXISTS (SELECT 1 FROM GeneralWorkPermit g WHERE g.PermitId = p.PermitId AND g.WorkLocation LIKE @LocationPattern) OR
                UPPER(p.PermitNumber) LIKE @PermitNumberPattern
            )`;
            whereClauses.push(locationExistsSql);
        }

        const whereSql = whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : '';

        // Get total count for pagination
        const countReq = pool.request();
        if (UserId && !isNaN(parseInt(UserId, 10))) countReq.input('UserId', sql.Int, parseInt(UserId, 10));
        if (locationFilter) countReq.input('LocationPattern', sql.NVarChar(200), `%${locationFilter}%`);
        if (permitNumberPattern) countReq.input('PermitNumberPattern', sql.NVarChar(200), permitNumberPattern);
        const countSql = `SELECT COUNT(*) AS total FROM PermitMaster p INNER JOIN UserPermitMaster upm ON p.PermitID = upm.PermitId ${whereSql}`;
        const countRes = await countReq.query(countSql);
        const total = (countRes.recordset && countRes.recordset[0] && countRes.recordset[0].total) ? parseInt(countRes.recordset[0].total, 10) : 0;

        // Fetch paginated permits
        const listReq = pool.request();
        if (UserId && !isNaN(parseInt(UserId, 10))) listReq.input('UserId', sql.Int, parseInt(UserId, 10));
        if (locationFilter) listReq.input('LocationPattern', sql.NVarChar(200), `%${locationFilter}%`);
        if (permitNumberPattern) listReq.input('PermitNumberPattern', sql.NVarChar(200), permitNumberPattern);
        listReq.input('OffsetRows', sql.Int, offset);
        listReq.input('PageSize', sql.Int, pageSize);

        const listSql = `
            SELECT p.*, 
                   upm.CurrentPermitStatus,
                   upm.Status as PermitStatus,
                   ptm.PermitType,
                   (SELECT COUNT(*) FROM PERMIT_FILES f WHERE f.PermitID = p.PermitID) as FileCount
            FROM PermitMaster p
            INNER JOIN UserPermitMaster upm ON p.PermitID = upm.PermitId
            INNER JOIN PermitTypeMaster ptm ON p.PermitTypeId = ptm.PermitTypeId
            ${whereSql}
            ORDER BY p.CreatedOn DESC
            OFFSET @OffsetRows ROWS FETCH NEXT @PageSize ROWS ONLY
        `;

        const result = await listReq.query(listSql);

        const permits = [];

        for (const permit of result.recordset) {
            let detailsQuery = '';
            switch (permit.PermitTypeId) {
                case 1:
                    detailsQuery = `
                        SELECT h.*,
                               dm.DepartmentName AS Department,
                               apm.AlarmPointName AS NearestFireAlarmPoint,
                               wlm.WorkLocationName AS WorkLocation
                        FROM HeightWorkPermit h
                        LEFT JOIN DepartmentMaster dm ON h.DepartmentId = dm.DepartmentId AND dm.IsActive = 1 AND dm.DelMark = 0
                        LEFT JOIN AlarmPointMaster apm ON h.AlarmPointId = apm.AlarmPointId AND apm.IsActive = 1 AND apm.DelMark = 0
                        LEFT JOIN WorkLocationMaster wlm ON h.WorkLocationId = wlm.WorkLocationId AND wlm.IsActive = 1 AND wlm.DelMark = 0
                        WHERE h.PermitId = @PermitId
                    `;
                    break;

                case 2:
                    detailsQuery = `
                        SELECT h.*,
                               dm.DepartmentName AS Department,
                               apm.AlarmPointName AS NearestFireAlarmPoint,
                               wlm.WorkLocationName AS WorkLocation
                        FROM HotWorkPermit h
                        LEFT JOIN DepartmentMaster dm ON h.DepartmentId = dm.DepartmentId AND dm.IsActive = 1 AND dm.DelMark = 0
                        LEFT JOIN AlarmPointMaster apm ON h.AlarmPointId = apm.AlarmPointId AND apm.IsActive = 1 AND apm.DelMark = 0
                        LEFT JOIN WorkLocationMaster wlm ON h.WorkLocationId = wlm.WorkLocationId AND wlm.IsActive = 1 AND wlm.DelMark = 0
                        WHERE h.PermitId = @PermitId
                    `;
                    break;

                case 3:
                    detailsQuery = `
                        SELECT e.*,
                               dm.DepartmentName AS Department,
                               apm.AlarmPointName AS NearestFireAlarmPoint,
                               wlm.WorkLocationName AS WorkLocation
                        FROM ElectricWorkPermit e
                        LEFT JOIN DepartmentMaster dm ON e.DepartmentId = dm.DepartmentId AND dm.IsActive = 1 AND dm.DelMark = 0
                        LEFT JOIN AlarmPointMaster apm ON e.AlarmPointId = apm.AlarmPointId AND apm.IsActive = 1 AND apm.DelMark = 0
                        LEFT JOIN WorkLocationMaster wlm ON e.WorkLocationId = wlm.WorkLocationId AND wlm.IsActive = 1 AND wlm.DelMark = 0
                        WHERE e.PermitId = @PermitId
                    `;
                    break;

                case 4:
                    detailsQuery = `
                        SELECT g.*,
                               dm.DepartmentName AS Department,
                               apm.AlarmPointName AS NearestFireAlarmPoint,
                               wlm.WorkLocationName AS WorkLocation
                        FROM GeneralWorkPermit g
                        LEFT JOIN DepartmentMaster dm ON g.DepartmentId = dm.DepartmentId AND dm.IsActive = 1 AND dm.DelMark = 0
                        LEFT JOIN AlarmPointMaster apm ON g.AlarmPointId = apm.AlarmPointId AND apm.IsActive = 1 AND apm.DelMark = 0
                        LEFT JOIN WorkLocationMaster wlm ON g.WorkLocationId = wlm.WorkLocationId AND wlm.IsActive = 1 AND wlm.DelMark = 0
                        WHERE g.PermitId = @PermitId
                    `;
                    break;
                default:
                    permit.Files = [];
                    permits.push(permit);
                    continue;
            }

            const detailsResult = await pool.request()
                .input('PermitId', sql.Int, permit.PermitId)
                .query(detailsQuery);
            const details = detailsResult.recordset[0] || {};
            const redundantFields = ['PermitId', 'PermitNumber'];
            for (const key in details) {
                if (details.hasOwnProperty(key) && !redundantFields.includes(key)) {
                    permit[key] = details[key];
                }
            }
            // Get files for the permit
            const filesResult = await pool.request()
                .input('PermitId', sql.Int, permit.PermitId)
                .query('SELECT FileID, FileName, FileSize, FileType, UploadDate FROM PERMIT_FILES WHERE PermitID = @PermitId ORDER BY UploadDate DESC');
            permit.Files = filesResult.recordset;

            // --- Add permitReachTo logic (single-stage string).
            // If permit is in close flow, prefer PermitCloseStatus to determine the current stage;
            // otherwise fall back to *_UpdatedBy fields.
            let reach = null;
            if (String(permit.CurrentPermitStatus) === 'Closer Pending' || String(permit.CurrentPermitStatus) === 'Close') {
                try {
                    const pcsRes = await pool.request()
                        .input('PermitId', sql.Numeric(18, 0), permit.PermitId)
                        .query('SELECT TOP 1 * FROM PermitCloseStatus WHERE PermitId = @PermitId');
                    const pcs = (pcsRes.recordset && pcsRes.recordset[0]) || null;
                    if (pcs) {
                        const order = [
                            { timeCol: 'IssuerCloseTime', name: 'issuer' },
                            { timeCol: 'ReceiverCloseTime', name: 'receiver' },
                            { timeCol: 'ReviewerCloseTime', name: 'reviewer' },
                            { timeCol: 'IsolationCloseTime', name: 'isolation' },
                            { timeCol: 'ApproverCloseTime', name: 'approver' }
                        ];
                        // Determine the most recently closed stage by timestamp (choose latest datetime)
                        let lastClosed = null;
                        let lastClosedTime = null;
                        for (const s of order) {
                            const val = pcs[s.timeCol];
                            if (val) {
                                const t = new Date(val);
                                if (!isNaN(t.getTime())) {
                                    if (!lastClosedTime || t.getTime() > lastClosedTime.getTime()) {
                                        lastClosedTime = t;
                                        lastClosed = s.name;
                                    }
                                }
                            }
                        }
                        if (lastClosed) {
                            reach = lastClosed;
                        } else {
                            // No stage closed yet: return first pending (issuer)
                            reach = 'issuer';
                        }
                    } else {
                        // fallback to UpdatedBy fields
                        if (permit?.Approver_UpdatedBy) reach = 'approver';
                        else if (permit?.Reviewer_UpdatedBy) reach = 'reviewer';
                        else if (permit?.Receiver_UpdatedBy) reach = 'receiver';
                        else if (permit?.EnergyIsolate_UpdatedBy) reach = 'isolation';
                        else reach = 'issuer';
                    }
                } catch (e) {
                    console.error('Failed to read PermitCloseStatus for permitReachTo:', e && e.message ? e.message : e);
                    // fallback to UpdatedBy fields
                    if (permit?.Approver_UpdatedBy) reach = 'approver';
                    else if (permit?.Reviewer_UpdatedBy) reach = 'reviewer';
                    else if (permit?.Receiver_UpdatedBy) reach = 'receiver';
                    else if (permit?.EnergyIsolate_UpdatedBy) reach = 'isolation';
                    else reach = 'issuer';
                }
            } else {
                // Determine most recent action among role DateTime fields so isolation is chosen
                // when its DateTime is the latest even if other UpdatedBy flags exist.
                const dtMap = [
                    { col: 'Issuer_DateTime', name: 'issuer' },
                    { col: 'Receiver_DateTime', name: 'receiver' },
                    { col: 'Reviewer_DateTime', name: 'reviewer' },
                    { col: 'EnergyIsolate_DateTime', name: 'isolation' },
                    { col: 'Approver_DateTime', name: 'approver' }
                ];
                let latest = null;
                let latestTime = null;
                for (const d of dtMap) {
                    const val = permit[d.col];
                    if (val) {
                        const t = new Date(val);
                        if (!isNaN(t.getTime())) {
                            if (!latestTime || t.getTime() > latestTime.getTime()) {
                                latestTime = t;
                                latest = d.name;
                            }
                        }
                    }
                }
                if (latest) reach = latest;
                else {
                    // fallback to UpdatedBy flags if no DateTimes available
                    if (permit?.Approver_UpdatedBy) reach = 'approver';
                    else if (permit?.Reviewer_UpdatedBy) reach = 'reviewer';
                    else if (permit?.Receiver_UpdatedBy) reach = 'receiver';
                    else if (permit?.EnergyIsolate_UpdatedBy) reach = 'isolation';
                    else reach = 'issuer';
                }
            }
            permit.permitReachTo = reach;

            // Resolve ReferencePermitId to ReferencePermitNumber if reference exists
            if (permit.ReferencePermitId) {
                try {
                    const refRes = await pool.request()
                        .input('ReferencePermitId', sql.Int, permit.ReferencePermitId)
                        .query('SELECT PermitNumber FROM PermitMaster WHERE PermitId = @ReferencePermitId');
                    if (refRes.recordset.length > 0) {
                        permit.ReferencePermitNumber = refRes.recordset[0].PermitNumber;
                    } else {
                        permit.ReferencePermitNumber = null;
                    }
                } catch (e) {
                    console.error('Failed to resolve ReferencePermitNumber:', e && e.message ? e.message : e);
                    permit.ReferencePermitNumber = null;
                }
            } else {
                permit.ReferencePermitNumber = null;
            }

            permits.push(permit);
        }

        res.json(permits);
    } catch (error) {
        console.error('Error fetching permits:', error);
        res.status(500).json({ error: 'Failed to fetch permits: ' + error.message });
    }
};

const getPermitById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || isNaN(id)) {
            return res.status(400).json({ error: 'Valid PermitId is required' });
        }

        const pool = await poolPromise;
        let CanReopen = false;

        // Get permit details from PermitMaster and UserPermitMaster
        const permitResult = await pool.request()
            .input('PermitId', sql.Int, id)
            .query(`
                SELECT p.*, 
                       um.Name as IssuerUserName,
                       upm.CurrentPermitStatus,
                       upm.Status as PermitStatus,
                       (SELECT COUNT(*) FROM PERMIT_FILES f WHERE f.PermitId = p.PermitId) as FileCount
                FROM PermitMaster p
                INNER JOIN UserPermitMaster upm ON p.PermitId = upm.PermitId
                INNER JOIN UserMaster um ON upm.UserId = um.UserId AND um.IsActive = 1 AND um.DelMark = 0
                WHERE p.PermitId = @PermitId AND upm.IsActive = 1 AND upm.DelMark = 0
            `);

        if (permitResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Permit not found' });
        }

        const permit = permitResult.recordset[0];

        // Get type-specific details based on PermitTypeId
        let detailsQuery = '';
        switch (permit.PermitTypeId) {
            case 1:
                    detailsQuery = `
                        SELECT h.*,
                               dm.DepartmentName AS DepartmentName,
                               apm.AlarmPointName AS NearestFireAlarmPointName,
                               wlm.WorkLocationName AS WorkLocationName
                        FROM HeightWorkPermit h
                        LEFT JOIN DepartmentMaster dm ON h.DepartmentId = dm.DepartmentId AND dm.IsActive = 1 AND dm.DelMark = 0
                        LEFT JOIN AlarmPointMaster apm ON h.AlarmPointId = apm.AlarmPointId AND apm.IsActive = 1 AND apm.DelMark = 0
                        LEFT JOIN WorkLocationMaster wlm ON h.WorkLocationId = wlm.WorkLocationId AND wlm.IsActive = 1 AND wlm.DelMark = 0
                        WHERE h.PermitId = @PermitId
                    `;
                    break;

                case 2:
                    detailsQuery = `
                        SELECT h.*,
                               dm.DepartmentName AS DepartmentName,
                               apm.AlarmPointName AS NearestFireAlarmPointName,
                               wlm.WorkLocationName AS WorkLocationName
                        FROM HotWorkPermit h
                        LEFT JOIN DepartmentMaster dm ON h.DepartmentId = dm.DepartmentId AND dm.IsActive = 1 AND dm.DelMark = 0
                        LEFT JOIN AlarmPointMaster apm ON h.AlarmPointId = apm.AlarmPointId AND apm.IsActive = 1 AND apm.DelMark = 0
                        LEFT JOIN WorkLocationMaster wlm ON h.WorkLocationId = wlm.WorkLocationId AND wlm.IsActive = 1 AND wlm.DelMark = 0
                        WHERE h.PermitId = @PermitId
                    `;
                    break;

                case 3:
                    detailsQuery = `
                        SELECT e.*,
                               dm.DepartmentName AS DepartmentName,
                               apm.AlarmPointName AS NearestFireAlarmPointName,
                               wlm.WorkLocationName AS WorkLocationName
                        FROM ElectricWorkPermit e
                        LEFT JOIN DepartmentMaster dm ON e.DepartmentId = dm.DepartmentId AND dm.IsActive = 1 AND dm.DelMark = 0
                        LEFT JOIN AlarmPointMaster apm ON e.AlarmPointId = apm.AlarmPointId AND apm.IsActive = 1 AND apm.DelMark = 0
                        LEFT JOIN WorkLocationMaster wlm ON e.WorkLocationId = wlm.WorkLocationId AND wlm.IsActive = 1 AND wlm.DelMark = 0
                        WHERE e.PermitId = @PermitId
                    `;
                    break;

                case 4:
                    detailsQuery = `
                        SELECT g.*,
                               dm.DepartmentName AS DepartmentName,
                               apm.AlarmPointName AS NearestFireAlarmPointName,
                               wlm.WorkLocationName AS WorkLocationName
                        FROM GeneralWorkPermit g
                        LEFT JOIN DepartmentMaster dm ON g.DepartmentId = dm.DepartmentId AND dm.IsActive = 1 AND dm.DelMark = 0
                        LEFT JOIN AlarmPointMaster apm ON g.AlarmPointId = apm.AlarmPointId AND apm.IsActive = 1 AND apm.DelMark = 0
                        LEFT JOIN WorkLocationMaster wlm ON g.WorkLocationId = wlm.WorkLocationId AND wlm.IsActive = 1 AND wlm.DelMark = 0
                        WHERE g.PermitId = @PermitId
                    `;
                    break;
            default:
                // No details for unsupported types
                permit.Files = [];

                permit.AdminDocuments = [];
                res.json(permit);
                return;
        }

        const detailsResult = await pool.request()
            .input('PermitId', sql.Int, id)
            .query(detailsQuery);

        const details = detailsResult.recordset[0] || {};

        // Flatten details into root object, skipping redundant fields
        const redundantFields = ['PermitId', 'PermitNumber'];
        for (const key in details) {
            if (details.hasOwnProperty(key) && !redundantFields.includes(key)) {
                permit[key] = details[key];
            }
        }

        // Resolve user IDs stored in *_UpdatedBy fields into user info objects
        // We add new keys (e.g. ApproverUser, ReviewerUser) but keep existing fields unchanged.
        const userIdFieldsMap = {
            'Approver_UpdatedBy': 'ApproverUser',
            'Reviewer_UpdatedBy': 'ReviewerUser',
            'Receiver_UpdatedBy': 'ReceiverUser',
            'EnergyIsolate_UpdatedBy': 'EnergyIsolateUser',
            'Issuer_UpdatedBy': 'IssuerUser'
        };

        for (const srcField in userIdFieldsMap) {
            const destKey = userIdFieldsMap[srcField];
            const rawVal = permit[srcField];
            let userId = null;
            if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
                const asInt = parseInt(rawVal, 10);
                if (!isNaN(asInt)) userId = asInt;
            }

            if (userId) {
                try {
                    const userRes = await pool.request()
                        .input('UserId', sql.Int, userId)
                        .query('SELECT UserId, Name, d.DesignationName as Designation, MailId FROM UserMaster Inner Join DesignationMaster d ON UserMaster.DesignationId = d.DesignationId WHERE UserId = @UserId AND UserMaster.IsActive = 1 AND UserMaster.DelMark = 0');

                    if (userRes.recordset.length > 0) {
                        const u = userRes.recordset[0];
                        permit[destKey] = {
                            UserId: u.UserId,
                            Name: u.Name || null,
                            Designation: u.Designation || null,
                            MailId: u.MailId || null
                        };
                    } else {
                        permit[destKey] = null;
                    }
                } catch (e) {
                    // On error, do not break response; set null and continue
                    console.error(`Failed to resolve user ${userId} for ${srcField}:`, e.message || e);
                    permit[destKey] = null;
                }
            } else {
                permit[destKey] = null;
            }
        }

        // Get associated files
        const filesResult = await pool.request()
            .input('PermitId', sql.Int, id)
            .query('SELECT FileID, FileName, FileSize, FileType, UploadDate FROM PERMIT_FILES WHERE PermitID = @PermitId ORDER BY UploadDate DESC');

        // Get admin documents from PermitAdminAttachment
        const adminDocsResult = await pool.request()
            .input('PermitId', sql.Int, id)
            .query('SELECT Documents FROM PermitAdminAttachment WHERE PermitId = @PermitId AND IsActive = 1 AND DelMark = 0');

        permit.Files = filesResult.recordset;
        permit.AdminDocuments = adminDocsResult.recordset.map(row => {
            try {
                return row.Documents ? JSON.parse(row.Documents) : null;
            } catch (e) {
                return row.Documents; // Fallback to raw if not valid JSON
            }
        }).filter(Boolean);

        // Resolve ReferencePermitId to ReferencePermitNumber if reference exists
        if (permit.ReferencePermitId) {
            try {
                const refRes = await pool.request()
                    .input('ReferencePermitId', sql.Int, permit.ReferencePermitId)
                    .query('SELECT PermitNumber FROM PermitMaster WHERE PermitId = @ReferencePermitId');
                if (refRes.recordset.length > 0) {
                    permit.ReferencePermitNumber = refRes.recordset[0].PermitNumber;
                } else {
                    permit.ReferencePermitNumber = null;
                }
            } catch (e) {
                console.error('Failed to resolve ReferencePermitNumber:', e && e.message ? e.message : e);
                permit.ReferencePermitNumber = null;
            }
        } else {
            permit.ReferencePermitNumber = null;
        }

        const isExpired = 
            permit.CurrentPermitStatus === 'Expired' || 
            (permit.EndDate && new Date(permit.EndDate) < new Date());

        if (isExpired && permit.PermitId) {
            try {
                const childPermitCheck = await pool.request()
                    .input('ReferencePermitId', sql.Int, permit.PermitId)
                    .query(`
                        SELECT TOP 1 1
                        FROM PermitMaster p
                        INNER JOIN UserPermitMaster upm ON p.PermitId = upm.PermitId
                        WHERE p.ReferencePermitId = @ReferencePermitId
                          AND upm.IsActive = 1 
                          AND upm.DelMark = 0
                    `);

                if (childPermitCheck.recordset.length < 1) {
                    CanReopen = true;
                }
            } catch (e) {
                console.error('Failed to check for child permits (canReopen):', e.message || e);
                CanReopen = false;
            }
        }

        permit.CanReopen = CanReopen;
        permit.NearestFireAlarmPoint = permit.NearestFireAlarmPointName || permit.NearestFireAlarmPoint;
        permit.WorkLocation = permit.WorkLocationName || permit.WorkLocation;
        res.json(permit);
    } catch (error) {
        console.error('Error fetching permit:', error);
        res.status(500).json({ error: 'Failed to fetch permit: ' + error.message });
    }
};

// NEW: Serve files from database by FileID
const getFileById = async (req, res) => {
    try {
        const { fileId } = req.params;
        
        // Validate that fileId is a valid number
        const fileIdNumber = parseInt(fileId, 10);
        if (isNaN(fileIdNumber) || fileIdNumber <= 0) {
            return res.status(400).json({ error: 'Invalid file ID. Must be a positive number.' });
        }
        
        console.log('Fetching file with ID:', fileIdNumber);
        
        const pool = await poolPromise;
        
        const result = await pool.request()
            .input('FileID', sql.Int, fileIdNumber)
            .query('SELECT FileName, FileType, FileData FROM PERMIT_FILES WHERE FileID = @FileID');
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const file = result.recordset[0];
        
        // Set appropriate headers
        res.setHeader('Content-Type', file.FileType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${file.FileName}"`);
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        
        // Send the binary data
        res.send(file.FileData);
    } catch (error) {
        console.error('Error serving file:', error);
        res.status(500).json({ error: 'Failed to serve file' });
    }
};

// Keep the old getFile function for backward compatibility (if needed)
const getFile = async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(uploadsDir, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        res.sendFile(path.resolve(filePath));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to serve file' });
    }
};

// Update permit (with file upload support)
// const updatePermit = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const {
//             PermitDate, NearestFireAlarmPoint, PermitNumber, TotalEngagedWorkers,
//             WorkLocation, WorkDescription, PermitValidUpTo, Organization,
//             SupervisorName, ContactNumber, Updated_by,
//             ScaffoldChecked, ScaffoldTagged, ScaffoldRechecked, ScaffoldErected,
//             HangingBaskets, PlatformSafe, CatLadders, EdgeProtection, Platforms,
//             SafetyHarness, EnergyPrecautions, Illumination, UnguardedAreas,
//             FallProtection, AccessMeans, SafetyHelmet, SafetyJacket, SafetyShoes,
//             Gloves, SafetyGoggles, FaceShield, DustMask, EarPlugEarmuff,
//             AntiSlipFootwear, SafetyNet, AnchorPointLifelines, SelfRetractingLifeline,
//             FullBodyHarness,
            
//             // NEW FIELDS for update
//             FileName, FileSize, FileType, UploadDate, FileData,
//             REASON, ADDITIONAL_PPE,
//             Issuer_Name, Issuer_Designation, Issuer_DateTime, Issuer_UpdatedBy,
//             Receiver_Name, Receiver_Designation, Receiver_DateTime, Receiver_UpdatedBy,
//             EnergyIsolate_Name, EnergyIsolate_Designation, EnergyIsolate_DateTime, EnergyIsolate_UpdatedBy,
//             Reviewer_Name, Reviewer_Designation, Reviewer_DateTime, Reviewer_UpdatedBy,
//             Approver_Name, Approver_Designation, Approver_DateTime, Approver_UpdatedBy
//         } = req.body;
//         console.log('DEBUG req.body for update:', req.body);
//         const pool = await poolPromise;
        
//         // Handle new uploaded files
//         const uploadedFiles = req.files || [];
//         const filesData = uploadedFiles.map(file => ({
//             originalName: file.originalname,
//             size: file.size,
//             mimetype: file.mimetype
//         }));
        
//         await pool.request()
//             .input('PermitID', sql.Int, id)
//             .input('PermitDate', sql.DateTime, PermitDate)
//             .input('NearestFireAlarmPoint', sql.NVarChar(255), NearestFireAlarmPoint)
//             .input('PermitNumber', sql.NVarChar(100), PermitNumber)
//             .input('TotalEngagedWorkers', sql.Int, TotalEngagedWorkers)
//             .input('WorkLocation', sql.NVarChar(255), WorkLocation)
//             .input('WorkDescription', sql.NVarChar(sql.MAX), WorkDescription)
//             .input('PermitValidUpTo', sql.DateTime, PermitValidUpTo)
//             .input('Organization', sql.NVarChar(255), Organization)
//             .input('SupervisorName', sql.NVarChar(255), SupervisorName)
//             .input('ContactNumber', sql.NVarChar(50), ContactNumber)
//             .input('Updated_by', sql.NVarChar(100), Updated_by)
//             .input('Updated_on', sql.DateTime, new Date())
            
//             // Scaffold safety checklist
//             .input('ScaffoldChecked', sql.Bit, ScaffoldChecked === 'true' ? 1 : 0)
//             .input('ScaffoldTagged', sql.Bit, ScaffoldTagged === 'true' ? 1 : 0)
//             .input('ScaffoldRechecked', sql.Bit, ScaffoldRechecked === 'true' ? 1 : 0)
//             .input('ScaffoldErected', sql.Bit, ScaffoldErected === 'true' ? 1 : 0)
//             .input('HangingBaskets', sql.Bit, HangingBaskets === 'true' ? 1 : 0)
//             .input('PlatformSafe', sql.Bit, PlatformSafe === 'true' ? 1 : 0)
//             .input('CatLadders', sql.Bit, CatLadders === 'true' ? 1 : 0)
//             .input('EdgeProtection', sql.Bit, EdgeProtection === 'true' ? 1 : 0)
//             .input('Platforms', sql.Bit, Platforms === 'true' ? 1 : 0)
//             .input('SafetyHarness', sql.Bit, SafetyHarness === 'true' ? 1 : 0)

//             // General safety precautions
//             .input('EnergyPrecautions', sql.Bit, EnergyPrecautions === 'true' ? 1 : 0)
//             .input('Illumination', sql.Bit, Illumination === 'true' ? 1 : 0)
//             .input('UnguardedAreas', sql.Bit, UnguardedAreas === 'true' ? 1 : 0)
//             .input('FallProtection', sql.Bit, FallProtection === 'true' ? 1 : 0)
//             .input('AccessMeans', sql.Bit, AccessMeans === 'true' ? 1 : 0)

//             // PPE requirements
//             .input('SafetyHelmet', sql.Bit, SafetyHelmet === 'true')
//             .input('SafetyJacket', sql.Bit, SafetyJacket === 'true')
//             .input('SafetyShoes', sql.Bit, SafetyShoes === 'true')
//             .input('Gloves', sql.Bit, Gloves === 'true')
//             .input('SafetyGoggles', sql.Bit, SafetyGoggles === 'true')
//             .input('FaceShield', sql.Bit, FaceShield === 'true')
//             .input('DustMask', sql.Bit, DustMask === 'true')
//             .input('EarPlugEarmuff', sql.Bit, EarPlugEarmuff === 'true')
//             .input('AntiSlipFootwear', sql.Bit, AntiSlipFootwear === 'true')
//             .input('SafetyNet', sql.Bit, SafetyNet === 'true')
//             .input('AnchorPointLifelines', sql.Bit, AnchorPointLifelines === 'true')
//             .input('SelfRetractingLifeline', sql.Bit, SelfRetractingLifeline === 'true')
//             .input('FullBodyHarness', sql.Bit, FullBodyHarness === 'true')

            
//             // NEW FIELDS for update
//             .input('FileName', sql.NVarChar(255), FileName)
//             .input('FileSize', sql.BigInt, FileSize)
//             .input('FileType', sql.NVarChar(100), FileType)
//             .input('UploadDate', sql.DateTime, UploadDate)
//             .input('FileData', sql.VarBinary(sql.MAX), FileData)
//             .input('REASON', sql.NVarChar(100), REASON)
//             .input('ADDITIONAL_PPE', sql.NVarChar(500), ADDITIONAL_PPE)
            
//             // Issuer fields
//             .input('Issuer_Name', sql.NVarChar(100), Issuer_Name)
//             .input('Issuer_Designation', sql.NVarChar(100), Issuer_Designation)
//             .input('Issuer_DateTime', sql.DateTime, Issuer_DateTime)
//             .input('Issuer_UpdatedBy', sql.NVarChar(100), Issuer_UpdatedBy)
            
//             // Receiver fields
//             .input('Receiver_Name', sql.NVarChar(100), Receiver_Name)
//             .input('Receiver_Designation', sql.NVarChar(100), Receiver_Designation)
//             .input('Receiver_DateTime', sql.DateTime, Receiver_DateTime)
//             .input('Receiver_UpdatedBy', sql.NVarChar(100), Receiver_UpdatedBy)
            
//             // Energy Isolate fields
//             .input('EnergyIsolate_Name', sql.NVarChar(100), EnergyIsolate_Name)
//             .input('EnergyIsolate_Designation', sql.NVarChar(100), EnergyIsolate_Designation)
//             .input('EnergyIsolate_DateTime', sql.DateTime, EnergyIsolate_DateTime)
//             .input('EnergyIsolate_UpdatedBy', sql.NVarChar(100), EnergyIsolate_UpdatedBy)
            
//             // Reviewer fields
//             .input('Reviewer_Name', sql.NVarChar(100), Reviewer_Name)
//             .input('Reviewer_Designation', sql.NVarChar(100), Reviewer_Designation)
//             .input('Reviewer_DateTime', sql.DateTime, Reviewer_DateTime)
//             .input('Reviewer_UpdatedBy', sql.NVarChar(100), Reviewer_UpdatedBy)
            
//             // Approver fields
//             .input('Approver_Name', sql.NVarChar(100), Approver_Name)
//             .input('Approver_Designation', sql.NVarChar(100), Approver_Designation)
//             .input('Approver_DateTime', sql.DateTime, Approver_DateTime)
//             .input('Approver_UpdatedBy', sql.NVarChar(100), Approver_UpdatedBy)
//             .query(`
//                 UPDATE WORK_PERMIT SET 
//                     PermitDate = @PermitDate,
//                     NearestFireAlarmPoint = @NearestFireAlarmPoint,
//                     PermitNumber = @PermitNumber,
//                     TotalEngagedWorkers = @TotalEngagedWorkers,
//                     WorkLocation = @WorkLocation,
//                     WorkDescription = @WorkDescription,
//                     PermitValidUpTo = @PermitValidUpTo,
//                     Organization = @Organization,
//                     SupervisorName = @SupervisorName,
//                     ContactNumber = @ContactNumber,
//                     Updated_by = @Updated_by,
//                     Updated_on = @Updated_on,
//                     ScaffoldChecked = @ScaffoldChecked,
//                     ScaffoldTagged = @ScaffoldTagged,
//                     ScaffoldRechecked = @ScaffoldRechecked,
//                     ScaffoldErected = @ScaffoldErected,
//                     HangingBaskets = @HangingBaskets,
//                     PlatformSafe = @PlatformSafe,
//                     CatLadders = @CatLadders,
//                     EdgeProtection = @EdgeProtection,
//                     Platforms = @Platforms,
//                     SafetyHarness = @SafetyHarness,
//                     EnergyPrecautions = @EnergyPrecautions,
//                     Illumination = @Illumination,
//                     UnguardedAreas = @UnguardedAreas,
//                     FallProtection = @FallProtection,
//                     AccessMeans = @AccessMeans,
//                     SafetyHelmet = @SafetyHelmet,
//                     SafetyJacket = @SafetyJacket,
//                     SafetyShoes = @SafetyShoes,
//                     Gloves = @Gloves,
//                     SafetyGoggles = @SafetyGoggles,
//                     FaceShield = @FaceShield,
//                     DustMask = @DustMask,
//                     EarPlugEarmuff = @EarPlugEarmuff,
//                     AntiSlipFootwear = @AntiSlipFootwear,
//                     SafetyNet = @SafetyNet,
//                     AnchorPointLifelines = @AnchorPointLifelines,
//                     SelfRetractingLifeline = @SelfRetractingLifeline,
//                     FullBodyHarness = @FullBodyHarness,
//                     FileName = @FileName,
//                     FileSize = @FileSize,
//                     FileType = @FileType,
//                     UploadDate = @UploadDate,
//                     FileData = @FileData,
//                     REASON = @REASON,
//                     ADDITIONAL_PPE = @ADDITIONAL_PPE,
//                     Issuer_Name = @Issuer_Name,
//                     Issuer_Designation = @Issuer_Designation,
//                     Issuer_DateTime = @Issuer_DateTime,
//                     Issuer_UpdatedBy = @Issuer_UpdatedBy,
//                     Receiver_Name = @Receiver_Name,
//                     Receiver_Designation = @Receiver_Designation,
//                     Receiver_DateTime = @Receiver_DateTime,
//                     Receiver_UpdatedBy = @Receiver_UpdatedBy,
//                     EnergyIsolate_Name = @EnergyIsolate_Name,
//                     EnergyIsolate_Designation = @EnergyIsolate_Designation,
//                     EnergyIsolate_DateTime = @EnergyIsolate_DateTime,
//                     EnergyIsolate_UpdatedBy = @EnergyIsolate_UpdatedBy,
//                     Reviewer_Name = @Reviewer_Name,
//                     Reviewer_Designation = @Reviewer_Designation,
//                     Reviewer_DateTime = @Reviewer_DateTime,
//                     Reviewer_UpdatedBy = @Reviewer_UpdatedBy,
//                     Approver_Name = @Approver_Name,
//                     Approver_Designation = @Approver_Designation,
//                     Approver_DateTime = @Approver_DateTime,
//                     Approver_UpdatedBy = @Approver_UpdatedBy
//                 WHERE PermitID = @PermitID
//             `);

//         // Add new files if any
//         if (uploadedFiles.length > 0) {
//             for (const file of uploadedFiles) {
//                 await pool.request()
//                     .input('PermitID', sql.Int, id)
//                     .input('FileName', sql.NVarChar(255), file.originalname)
//                     .input('FileSize', sql.BigInt, file.size)
//                     .input('FileType', sql.NVarChar(100), file.mimetype)
//                     .input('FileData', sql.VarBinary(sql.MAX), file.buffer)
//                     .input('UploadedAt', sql.DateTime, new Date())
//                     .query(`
//                         INSERT INTO PERMIT_FILES (PermitID, FileName, FileSize, FileType, FileData, UploadedAt)
//                         VALUES (@PermitID, @FileName, @FileSize, @FileType, @FileData, @UploadedAt)
//                     `);
//             }
//         }

//         res.json({ 
//             message: 'Permit updated successfully',
//             newFilesUploaded: uploadedFiles.length
//         });
//     } catch (error) {
//         console.error(error);
        
//         // Clean up uploaded files if database operation failed
//         if (req.files && req.files.length > 0) {
//             req.files.forEach(file => {
//                 if (fs.existsSync(file.path)) {
//                     fs.unlinkSync(file.path);
//                 }
//             });
//         }
        
//         res.status(500).json({ error: 'Failed to update permit' });
//     }
// };

const updatePermit = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            UserId,
            PermitTypeId,
            PermitDate,
            NearestFireAlarmPoint,
            PermitNumber,
            TotalEngagedWorkers,
            WorkLocation,
            WorkDescription,
            PermitValidUpTo,
            Organization,
            SupervisorName,
            ContactNumber,
            Updated_by,
            // HeightWorkPermit-specific
            ScaffoldChecked,
            ScaffoldTagged,
            ScaffoldRechecked,
            ScaffoldErected,
            HangingBaskets,
            PlatformSafe,
            CatLadders,
            EdgeProtection,
            Platforms,
            SafetyHarness,
            EnergyPrecautions,
            Illumination,
            UnguardedAreas,
            FallProtection,
            AccessMeans,
            SafetyNet,
            AnchorPointLifelines,
            SelfRetractingLifeline,
            FullBodyHarness,
            Reason, // HeightWorkPermit
            // HotWorkPermit-specific
            WorkAreaInspected,
            SurroundingAreaChecked,
            SewersCovered,
            WarningSigns,
            FireEquipmentAccess,
            VentilationLighting,
            OilGasTrapped,
            WeldingEquipment,
            EarthingElcb,
            HeightPermit,
            EquipmentDrained,
            LockoutTagout,
            NoiseDust,
            SlipTripFall,
            VehicleHazards,
            FallingObjects,
            ManualHandling,
            LackOfOxygen,
            BiologicalHazards,
            ElectricalHazards,
            CombustibleGases,
            WeldingGloves,
            WeldingGlasses,
            WeldingApron,
            // GeneralWorkPermit-specific
            WorkersInstructed,
            GumBoot,
            ThermalCloth,
            Remarks, // GeneralWorkPermit
            // ElectricWorkPermit-specific
            EquipmentTools,
            AreaInspected,
            SurroundingChecked,
            TrainedWorkers,
            SafetyEquipment,
            CircuitBreakerOff,
            TestingEquipment,
            DryArea,
            EmergencyProcedures,
            DeEnergized,
            ElectricShock,
            ElectricFireExplosion,
            FaultyTools,
            ArcFlash,
            ElectricalBurn,
            ElectricalFire,
            InsulatedGloves,
            FireResistanceCloth,
            ShockProofBoot,
            InsulatedMat,
            InsulatedHandGloves,
            FireExtinguishers,
            // Common fields across all permit types
            SafetyHelmet,
            SafetyJacket,
            SafetyShoes,
            Gloves,
            SafetyGoggles,
            FaceShield,
            DustMask,
            EarPlugEarmuff,
            AntiSlipFootwear,
            MachineId,
            LockTagNo,
            OtherHazards,
            AdditionalPpe,
            Issuer_Name,
            Issuer_Designation,
            Issuer_DateTime,
            Issuer_UpdatedBy,
            Receiver_Name,
            Receiver_Designation,
            Receiver_DateTime,
            Receiver_UpdatedBy,
            EnergyIsolate_Name,
            EnergyIsolate_Designation,
            EnergyIsolate_DateTime,
            EnergyIsolate_UpdatedBy,
            Reviewer_Name,
            Reviewer_Designation,
            Reviewer_DateTime,
            Reviewer_UpdatedBy,
            Approver_Name,
            Approver_Designation,
            Approver_DateTime,
            Approver_UpdatedBy,
            status,
            IsolationRequired,
        } = req.body;

        console.log('DEBUG req.body for update:', req.body);

        if (!id || isNaN(id)) {
            return res.status(400).json({ error: 'Valid PermitId is required' });
        }
        if (!PermitTypeId || ![1, 2, 3, 4].includes(Number(PermitTypeId))) {
            return res.status(400).json({ error: 'Valid PermitTypeId (1, 2, 3, or 4) is required' });
        }

        const pool = await poolPromise;

        // Update PermitMaster for common fields
        await pool.request()
            .input('PermitId', sql.Int, id)
            .input('PermitNumber', sql.NVarChar(100), PermitNumber)
            .input('PermitTypeId', sql.Int, PermitTypeId)
            .input('UpdatedBy', sql.NVarChar(100), Updated_by)
            .input('UpdatedOn', sql.DateTime, new Date())
            .query(`
                UPDATE PermitMaster SET 
                    PermitNumber = @PermitNumber,
                    PermitTypeId = @PermitTypeId,
                    UpdatedBy = @UpdatedBy,
                    UpdatedOn = @UpdatedOn
                WHERE PermitId = @PermitId
            `);
        const defaultStatus = 'Active';
        // Update UserPermitMaster for status fields
        await pool.request()
            .input('PermitId', sql.Int, id)
            .input('CurrentPermitStatus', sql.NVarChar(50), defaultStatus)
            .input('Status', sql.NVarChar(50), status)
            .input('UpdatedBy', sql.NVarChar(100), Updated_by)
            .input('UpdatedOn', sql.DateTime, new Date())
            .query(`
                UPDATE UserPermitMaster SET 
                    CurrentPermitStatus = @CurrentPermitStatus,
                    Status = @Status
                WHERE PermitId = @PermitId
            `);

        // Prepare type-specific update query
        let updateQuery = '';
        let inputs = [];

        switch (Number(PermitTypeId)) {
            case 1: // HeightWorkPermit
                updateQuery = `
                    UPDATE HeightWorkPermit SET
                        PermitDate = @PermitDate,
                        NearestFireAlarmPoint = @NearestFireAlarmPoint,
                        TotalEngagedWorkers = @TotalEngagedWorkers,
                        WorkLocation = @WorkLocation,
                        WorkDescription = @WorkDescription,
                        PermitValidUpTo = @PermitValidUpTo,
                        Organization = @Organization,
                        SupervisorName = @SupervisorName,
                        ContactNumber = @ContactNumber,
                        Reason = @Reason,
                        Updated_by = @Updated_by,
                        Updated_on = @Updated_on,
                        ScaffoldChecked = @ScaffoldChecked,
                        ScaffoldTagged = @ScaffoldTagged,
                        ScaffoldRechecked = @ScaffoldRechecked,
                        ScaffoldErected = @ScaffoldErected,
                        HangingBaskets = @HangingBaskets,
                        PlatformSafe = @PlatformSafe,
                        CatLadders = @CatLadders,
                        EdgeProtection = @EdgeProtection,
                        Platforms = @Platforms,
                        SafetyHarness = @SafetyHarness,
                        EnergyPrecautions = @EnergyPrecautions,
                        Illumination = @Illumination,
                        UnguardedAreas = @UnguardedAreas,
                        FallProtection = @FallProtection,
                        AccessMeans = @AccessMeans,
                        SafetyHelmet = @SafetyHelmet,
                        SafetyJacket = @SafetyJacket,
                        SafetyShoes = @SafetyShoes,
                        Gloves = @Gloves,
                        SafetyGoggles = @SafetyGoggles,
                        FaceShield = @FaceShield,
                        DustMask = @DustMask,
                        EarPlugEarmuff = @EarPlugEarmuff,
                        SafetyNet = @SafetyNet,
                        AnchorPointLifelines = @AnchorPointLifelines,
                        SelfRetractingLifeline = @SelfRetractingLifeline,
                        FullBodyHarness = @FullBodyHarness,
                        MachineId = @MachineId,
                        LockTagNo = @LockTagNo,
                        AdditionalPpe = @AdditionalPpe,
                        Issuer_Name = @Issuer_Name,
                        Issuer_Designation = @Issuer_Designation,
                        Issuer_DateTime = @Issuer_DateTime,
                        Issuer_UpdatedBy = @Issuer_UpdatedBy,
                        Receiver_Name = @Receiver_Name,
                        Receiver_Designation = @Receiver_Designation,
                        Receiver_DateTime = @Receiver_DateTime,
                        Receiver_UpdatedBy = @Receiver_UpdatedBy,
                        EnergyIsolate_Name = @EnergyIsolate_Name,
                        EnergyIsolate_Designation = @EnergyIsolate_Designation,
                        EnergyIsolate_DateTime = @EnergyIsolate_DateTime,
                        EnergyIsolate_UpdatedBy = @EnergyIsolate_UpdatedBy,
                        Reviewer_Name = @Reviewer_Name,
                        Reviewer_Designation = @Reviewer_Designation,
                        Reviewer_DateTime = @Reviewer_DateTime,
                        Reviewer_UpdatedBy = @Reviewer_UpdatedBy,
                        Approver_Name = @Approver_Name,
                        Approver_Designation = @Approver_Designation,
                        Approver_DateTime = @Approver_DateTime,
                        Approver_UpdatedBy = @Approver_UpdatedBy,
                        IsolationRequired = @IsolationRequired
                    WHERE PermitId = @PermitId
                `;
                inputs = [
                    ['PermitId', sql.Int, id],
                    ['PermitDate', sql.DateTime, PermitDate],
                    ['NearestFireAlarmPoint', sql.NVarChar(255), NearestFireAlarmPoint],
                    ['TotalEngagedWorkers', sql.Int, TotalEngagedWorkers],
                    ['WorkLocation', sql.NVarChar(255), WorkLocation],
                    ['WorkDescription', sql.NVarChar(sql.MAX), WorkDescription],
                    ['PermitValidUpTo', sql.DateTime, PermitValidUpTo],
                    ['Organization', sql.NVarChar(255), Organization],
                    ['SupervisorName', sql.NVarChar(255), SupervisorName],
                    ['ContactNumber', sql.NVarChar(50), ContactNumber],
                    ['Reason', sql.NVarChar(500), Reason],
                    ['Updated_by', sql.NVarChar(100), Updated_by],
                    ['Updated_on', sql.DateTime, new Date()],
                    ['ScaffoldChecked', sql.Bit, ScaffoldChecked === 'true' ? 1 : 0],
                    ['ScaffoldTagged', sql.Bit, ScaffoldTagged === 'true' ? 1 : 0],
                    ['ScaffoldRechecked', sql.Bit, ScaffoldRechecked === 'true' ? 1 : 0],
                    ['ScaffoldErected', sql.Bit, ScaffoldErected === 'true' ? 1 : 0],
                    ['HangingBaskets', sql.Bit, HangingBaskets === 'true' ? 1 : 0],
                    ['PlatformSafe', sql.Bit, PlatformSafe === 'true' ? 1 : 0],
                    ['CatLadders', sql.Bit, CatLadders === 'true' ? 1 : 0],
                    ['EdgeProtection', sql.Bit, EdgeProtection === 'true' ? 1 : 0],
                    ['Platforms', sql.Bit, Platforms === 'true' ? 1 : 0],
                    ['SafetyHarness', sql.Bit, SafetyHarness === 'true' ? 1 : 0],
                    ['EnergyPrecautions', sql.Bit, EnergyPrecautions === 'true' ? 1 : 0],
                    ['Illumination', sql.Bit, Illumination === 'true' ? 1 : 0],
                    ['UnguardedAreas', sql.Bit, UnguardedAreas === 'true' ? 1 : 0],
                    ['FallProtection', sql.Bit, FallProtection === 'true' ? 1 : 0],
                    ['AccessMeans', sql.Bit, AccessMeans === 'true' ? 1 : 0],
                    ['SafetyHelmet', sql.Bit, SafetyHelmet === 'true' ? 1 : 0],
                    ['SafetyJacket', sql.Bit, SafetyJacket === 'true' ? 1 : 0],
                    ['SafetyShoes', sql.Bit, SafetyShoes === 'true' ? 1 : 0],
                    ['Gloves', sql.Bit, Gloves === 'true' ? 1 : 0],
                    ['SafetyGoggles', sql.Bit, SafetyGoggles === 'true' ? 1 : 0],
                    ['FaceShield', sql.Bit, FaceShield === 'true' ? 1 : 0],
                    ['DustMask', sql.Bit, DustMask === 'true' ? 1 : 0],
                    ['EarPlugEarmuff', sql.Bit, EarPlugEarmuff === 'true' ? 1 : 0],
                    ['SafetyNet', sql.Bit, SafetyNet === 'true' ? 1 : 0],
                    ['AnchorPointLifelines', sql.Bit, AnchorPointLifelines === 'true' ? 1 : 0],
                    ['SelfRetractingLifeline', sql.Bit, SelfRetractingLifeline === 'true' ? 1 : 0],
                    ['FullBodyHarness', sql.Bit, FullBodyHarness === 'true' ? 1 : 0],
                    ['MachineId', sql.NVarChar(100), MachineId],
                    ['LockTagNo', sql.NVarChar(100), LockTagNo],
                    ['AdditionalPpe', sql.NVarChar(500), AdditionalPpe],
                    ['Issuer_Name', sql.NVarChar(100), Issuer_Name],
                    ['Issuer_Designation', sql.NVarChar(100), Issuer_Designation],
                    ['Issuer_DateTime', sql.DateTime, Issuer_DateTime],
                    ['Issuer_UpdatedBy', sql.NVarChar(100), Issuer_UpdatedBy],
                    ['Receiver_Name', sql.NVarChar(100), Receiver_Name],
                    ['Receiver_Designation', sql.NVarChar(100), Receiver_Designation],
                    ['Receiver_DateTime', sql.DateTime, Receiver_DateTime],
                    ['Receiver_UpdatedBy', sql.NVarChar(100), Receiver_UpdatedBy],
                    ['EnergyIsolate_Name', sql.NVarChar(100), EnergyIsolate_Name],
                    ['EnergyIsolate_Designation', sql.NVarChar(100), EnergyIsolate_Designation],
                    ['EnergyIsolate_DateTime', sql.DateTime, EnergyIsolate_DateTime],
                    ['EnergyIsolate_UpdatedBy', sql.NVarChar(100), EnergyIsolate_UpdatedBy],
                    ['Reviewer_Name', sql.NVarChar(100), Reviewer_Name],
                    ['Reviewer_Designation', sql.NVarChar(100), Reviewer_Designation],
                    ['Reviewer_DateTime', sql.DateTime, Reviewer_DateTime],
                    ['Reviewer_UpdatedBy', sql.NVarChar(100), Reviewer_UpdatedBy],
                    ['Approver_Name', sql.NVarChar(100), Approver_Name],
                    ['Approver_Designation', sql.NVarChar(100), Approver_Designation],
                    ['Approver_DateTime', sql.DateTime, Approver_DateTime],
                    ['Approver_UpdatedBy', sql.NVarChar(100), Approver_UpdatedBy],
                    ['IsolationRequired', sql.Bit, IsolationRequired === 'true' ? 1 : 0]
                ];
                break;
            case 2: // HotWorkPermit
                updateQuery = `
                    UPDATE HotWorkPermit SET
                        PermitDate = @PermitDate,
                        NearestFireAlarmPoint = @NearestFireAlarmPoint,
                        TotalEngagedWorkers = @TotalEngagedWorkers,
                        WorkLocation = @WorkLocation,
                        WorkDescription = @WorkDescription,
                        PermitValidUpTo = @PermitValidUpTo,
                        Organization = @Organization,
                        SupervisorName = @SupervisorName,
                        ContactNumber = @ContactNumber,
                        Updated_by = @Updated_by,
                        Updated_on = @Updated_on,
                        WorkAreaInspected = @WorkAreaInspected,
                        SurroundingAreaChecked = @SurroundingAreaChecked,
                        SewersCovered = @SewersCovered,
                        WarningSigns = @WarningSigns,
                        FireEquipmentAccess = @FireEquipmentAccess,
                        VentilationLighting = @VentilationLighting,
                        OilGasTrapped = @OilGasTrapped,
                        WeldingEquipment = @WeldingEquipment,
                        EarthingElcb = @EarthingElcb,
                        HeightPermit = @HeightPermit,
                        EquipmentDrained = @EquipmentDrained,
                        LockoutTagout = @LockoutTagout,
                        NoiseDust = @NoiseDust,
                        SlipTripFall = @SlipTripFall,
                        VehicleHazards = @VehicleHazards,
                        FallingObjects = @FallingObjects,
                        ManualHandling = @ManualHandling,
                        LackOfOxygen = @LackOfOxygen,
                        BiologicalHazards = @BiologicalHazards,
                        ElectricalHazards = @ElectricalHazards,
                        CombustibleGases = @CombustibleGases,
                        SafetyHelmet = @SafetyHelmet,
                        SafetyJacket = @SafetyJacket,
                        SafetyShoes = @SafetyShoes,
                        WeldingGloves = @WeldingGloves,
                        WeldingGlasses = @WeldingGlasses,
                        FaceShield = @FaceShield,
                        WeldingApron = @WeldingApron,
                        DustMask = @DustMask,
                        EarPlugEarmuff = @EarPlugEarmuff,
                        MachineId = @MachineId,
                        LockTagNo = @LockTagNo,
                        OtherHazards = @OtherHazards,
                        AdditionalPpe = @AdditionalPpe,
                        Issuer_Name = @Issuer_Name,
                        Issuer_Designation = @Issuer_Designation,
                        Issuer_DateTime = @Issuer_DateTime,
                        Issuer_UpdatedBy = @Issuer_UpdatedBy,
                        Receiver_Name = @Receiver_Name,
                        Receiver_Designation = @Receiver_Designation,
                        Receiver_DateTime = @Receiver_DateTime,
                        Receiver_UpdatedBy = @Receiver_UpdatedBy,
                        EnergyIsolate_Name = @EnergyIsolate_Name,
                        EnergyIsolate_Designation = @EnergyIsolate_Designation,
                        EnergyIsolate_DateTime = @EnergyIsolate_DateTime,
                        EnergyIsolate_UpdatedBy = @EnergyIsolate_UpdatedBy,
                        Reviewer_Name = @Reviewer_Name,
                        Reviewer_Designation = @Reviewer_Designation,
                        Reviewer_DateTime = @Reviewer_DateTime,
                        Reviewer_UpdatedBy = @Reviewer_UpdatedBy,
                        Approver_Name = @Approver_Name,
                        Approver_Designation = @Approver_Designation,
                        Approver_DateTime = @Approver_DateTime,
                        Approver_UpdatedBy = @Approver_UpdatedBy,
                        IsolationRequired = @IsolationRequired,
                        Reason = @Reason
                    WHERE PermitId = @PermitId
                `;
                inputs = [
                    ['PermitId', sql.Int, id],
                    ['PermitDate', sql.DateTime, PermitDate],
                    ['NearestFireAlarmPoint', sql.NVarChar(255), NearestFireAlarmPoint],
                    ['TotalEngagedWorkers', sql.Int, TotalEngagedWorkers],
                    ['WorkLocation', sql.NVarChar(255), WorkLocation],
                    ['WorkDescription', sql.NVarChar(sql.MAX), WorkDescription],
                    ['PermitValidUpTo', sql.DateTime, PermitValidUpTo],
                    ['Organization', sql.NVarChar(255), Organization],
                    ['SupervisorName', sql.NVarChar(255), SupervisorName],
                    ['ContactNumber', sql.NVarChar(50), ContactNumber],
                    ['Updated_by', sql.NVarChar(100), Updated_by],
                    ['Updated_on', sql.DateTime, new Date()],
                    ['WorkAreaInspected', sql.Bit, WorkAreaInspected === 'true' ? 1 : 0],
                    ['SurroundingAreaChecked', sql.Bit, SurroundingAreaChecked === 'true' ? 1 : 0],
                    ['SewersCovered', sql.Bit, SewersCovered === 'true' ? 1 : 0],
                    ['WarningSigns', sql.Bit, WarningSigns === 'true' ? 1 : 0],
                    ['FireEquipmentAccess', sql.Bit, FireEquipmentAccess === 'true' ? 1 : 0],
                    ['VentilationLighting', sql.Bit, VentilationLighting === 'true' ? 1 : 0],
                    ['OilGasTrapped', sql.Bit, OilGasTrapped === 'true' ? 1 : 0],
                    ['WeldingEquipment', sql.Bit, WeldingEquipment === 'true' ? 1 : 0],
                    ['EarthingElcb', sql.Bit, EarthingElcb === 'true' ? 1 : 0],
                    ['HeightPermit', sql.Bit, HeightPermit === 'true' ? 1 : 0],
                    ['EquipmentDrained', sql.Bit, EquipmentDrained === 'true' ? 1 : 0],
                    ['LockoutTagout', sql.Bit, LockoutTagout === 'true' ? 1 : 0],
                    ['NoiseDust', sql.Bit, NoiseDust === 'true' ? 1 : 0],
                    ['SlipTripFall', sql.Bit, SlipTripFall === 'true' ? 1 : 0],
                    ['VehicleHazards', sql.Bit, VehicleHazards === 'true' ? 1 : 0],
                    ['FallingObjects', sql.Bit, FallingObjects === 'true' ? 1 : 0],
                    ['ManualHandling', sql.Bit, ManualHandling === 'true' ? 1 : 0],
                    ['LackOfOxygen', sql.Bit, LackOfOxygen === 'true' ? 1 : 0],
                    ['BiologicalHazards', sql.Bit, BiologicalHazards === 'true' ? 1 : 0],
                    ['ElectricalHazards', sql.Bit, ElectricalHazards === 'true' ? 1 : 0],
                    ['CombustibleGases', sql.Bit, CombustibleGases === 'true' ? 1 : 0],
                    ['SafetyHelmet', sql.Bit, SafetyHelmet === 'true' ? 1 : 0],
                    ['SafetyJacket', sql.Bit, SafetyJacket === 'true' ? 1 : 0],
                    ['SafetyShoes', sql.Bit, SafetyShoes === 'true' ? 1 : 0],
                    ['WeldingGloves', sql.Bit, WeldingGloves === 'true' ? 1 : 0],
                    ['WeldingGlasses', sql.Bit, WeldingGlasses === 'true' ? 1 : 0],
                    ['FaceShield', sql.Bit, FaceShield === 'true' ? 1 : 0],
                    ['WeldingApron', sql.Bit, WeldingApron === 'true' ? 1 : 0],
                    ['DustMask', sql.Bit, DustMask === 'true' ? 1 : 0],
                    ['EarPlugEarmuff', sql.Bit, EarPlugEarmuff === 'true' ? 1 : 0],
                    ['MachineId', sql.NVarChar(100), MachineId],
                    ['LockTagNo', sql.NVarChar(100), LockTagNo],
                    ['OtherHazards', sql.NVarChar(500), OtherHazards],
                    ['AdditionalPpe', sql.NVarChar(500), AdditionalPpe],
                    ['Issuer_Name', sql.NVarChar(100), Issuer_Name],
                    ['Issuer_Designation', sql.NVarChar(100), Issuer_Designation],
                    ['Issuer_DateTime', sql.DateTime, Issuer_DateTime],
                    ['Issuer_UpdatedBy', sql.NVarChar(100), Issuer_UpdatedBy],
                    ['Receiver_Name', sql.NVarChar(100), Receiver_Name],
                    ['Receiver_Designation', sql.NVarChar(100), Receiver_Designation],
                    ['Receiver_DateTime', sql.DateTime, Receiver_DateTime],
                    ['Receiver_UpdatedBy', sql.NVarChar(100), Receiver_UpdatedBy],
                    ['EnergyIsolate_Name', sql.NVarChar(100), EnergyIsolate_Name],
                    ['EnergyIsolate_Designation', sql.NVarChar(100), EnergyIsolate_Designation],
                    ['EnergyIsolate_DateTime', sql.DateTime, EnergyIsolate_DateTime],
                    ['EnergyIsolate_UpdatedBy', sql.NVarChar(100), EnergyIsolate_UpdatedBy],
                    ['Reviewer_Name', sql.NVarChar(100), Reviewer_Name],
                    ['Reviewer_Designation', sql.NVarChar(100), Reviewer_Designation],
                    ['Reviewer_DateTime', sql.DateTime, Reviewer_DateTime],
                    ['Reviewer_UpdatedBy', sql.NVarChar(100), Reviewer_UpdatedBy],
                    ['Approver_Name', sql.NVarChar(100), Approver_Name],
                    ['Approver_Designation', sql.NVarChar(100), Approver_Designation],
                    ['Approver_DateTime', sql.DateTime, Approver_DateTime],
                    ['Approver_UpdatedBy', sql.NVarChar(100), Approver_UpdatedBy],
                    ['IsolationRequired', sql.Bit, IsolationRequired === 'true' ? 1 : 0],
                    ['Reason', sql.NVarChar(200), Reason]
                ];
                break;
            case 3: // ElectricWorkPermit
                updateQuery = `
                    UPDATE ElectricWorkPermit SET
                        PermitDate = @PermitDate,
                        NearestFireAlarmPoint = @NearestFireAlarmPoint,
                        TotalEngagedWorkers = @TotalEngagedWorkers,
                        WorkLocation = @WorkLocation,
                        WorkDescription = @WorkDescription,
                        PermitValidUpTo = @PermitValidUpTo,
                        Organization = @Organization,
                        SupervisorName = @SupervisorName,
                        ContactNumber = @ContactNumber,
                        EquipmentTools = @EquipmentTools,
                        Updated_by = @Updated_by,
                        Updated_on = @Updated_on,
                        AreaInspected = @AreaInspected,
                        SurroundingChecked = @SurroundingChecked,
                        WarningSigns = @WarningSigns,
                        TrainedWorkers = @TrainedWorkers,
                        SafetyEquipment = @SafetyEquipment,
                        VentilationLighting = @VentilationLighting,
                        CircuitBreakerOff = @CircuitBreakerOff,
                        TestingEquipment = @TestingEquipment,
                        DryArea = @DryArea,
                        EmergencyProcedures = @EmergencyProcedures,
                        HeightPermit = @HeightPermit,
                        DeEnergized = @DeEnergized,
                        LockoutTagout = @LockoutTagout,
                        ElectricShock = @ElectricShock,
                        ElectricFireExplosion = @ElectricFireExplosion,
                        FaultyTools = @FaultyTools,
                        ArcFlash = @ArcFlash,
                        ElectricalBurn = @ElectricalBurn,
                        ElectricalFire = @ElectricalFire,
                        SafetyHelmet = @SafetyHelmet,
                        SafetyJacket = @SafetyJacket,
                        SafetyShoes = @SafetyShoes,
                        InsulatedGloves = @InsulatedGloves,
                        FireResistanceCloth = @FireResistanceCloth,
                        ShockProofBoot = @ShockProofBoot,
                        InsulatedMat = @InsulatedMat,
                        InsulatedHandGloves = @InsulatedHandGloves,
                        FireExtinguishers = @FireExtinguishers,
                        MachineId = @MachineId,
                        LockTagNo = @LockTagNo,
                        OtherHazards = @OtherHazards,
                        AdditionalPpe = @AdditionalPpe,
                        Issuer_Name = @Issuer_Name,
                        Issuer_Designation = @Issuer_Designation,
                        Issuer_DateTime = @Issuer_DateTime,
                        Issuer_UpdatedBy = @Issuer_UpdatedBy,
                        Receiver_Name = @Receiver_Name,
                        Receiver_Designation = @Receiver_Designation,
                        Receiver_DateTime = @Receiver_DateTime,
                        Receiver_UpdatedBy = @Receiver_UpdatedBy,
                        EnergyIsolate_Name = @EnergyIsolate_Name,
                        EnergyIsolate_Designation = @EnergyIsolate_Designation,
                        EnergyIsolate_DateTime = @EnergyIsolate_DateTime,
                        EnergyIsolate_UpdatedBy = @EnergyIsolate_UpdatedBy,
                        Reviewer_Name = @Reviewer_Name,
                        Reviewer_Designation = @Reviewer_Designation,
                        Reviewer_DateTime = @Reviewer_DateTime,
                        Reviewer_UpdatedBy = @Reviewer_UpdatedBy,
                        Approver_Name = @Approver_Name,
                        Approver_Designation = @Approver_Designation,
                        Approver_DateTime = @Approver_DateTime,
                        Approver_UpdatedBy = @Approver_UpdatedBy,
                        IsolationRequired = @IsolationRequired,
                        Reason = @Reason
                    WHERE PermitId = @PermitId
                `;
                inputs = [
                    ['PermitId', sql.Int, id],
                    ['PermitDate', sql.DateTime, PermitDate],
                    ['NearestFireAlarmPoint', sql.NVarChar(255), NearestFireAlarmPoint],
                    ['TotalEngagedWorkers', sql.Int, TotalEngagedWorkers],
                    ['WorkLocation', sql.NVarChar(255), WorkLocation],
                    ['WorkDescription', sql.NVarChar(sql.MAX), WorkDescription],
                    ['PermitValidUpTo', sql.DateTime, PermitValidUpTo],
                    ['Organization', sql.NVarChar(255), Organization],
                    ['SupervisorName', sql.NVarChar(255), SupervisorName],
                    ['ContactNumber', sql.NVarChar(50), ContactNumber],
                    ['EquipmentTools', sql.NVarChar(sql.MAX), EquipmentTools],
                    ['Updated_by', sql.NVarChar(100), Updated_by],
                    ['Updated_on', sql.DateTime, new Date()],
                    ['AreaInspected', sql.Bit, AreaInspected === 'true' ? 1 : 0],
                    ['SurroundingChecked', sql.Bit, SurroundingChecked === 'true' ? 1 : 0],
                    ['WarningSigns', sql.Bit, WarningSigns === 'true' ? 1 : 0],
                    ['TrainedWorkers', sql.Bit, TrainedWorkers === 'true' ? 1 : 0],
                    ['SafetyEquipment', sql.Bit, SafetyEquipment === 'true' ? 1 : 0],
                    ['VentilationLighting', sql.Bit, VentilationLighting === 'true' ? 1 : 0],
                    ['CircuitBreakerOff', sql.Bit, CircuitBreakerOff === 'true' ? 1 : 0],
                    ['TestingEquipment', sql.Bit, TestingEquipment === 'true' ? 1 : 0],
                    ['DryArea', sql.Bit, DryArea === 'true' ? 1 : 0],
                    ['EmergencyProcedures', sql.Bit, EmergencyProcedures === 'true' ? 1 : 0],
                    ['HeightPermit', sql.Bit, HeightPermit === 'true' ? 1 : 0],
                    ['DeEnergized', sql.Bit, DeEnergized === 'true' ? 1 : 0],
                    ['LockoutTagout', sql.Bit, LockoutTagout === 'true' ? 1 : 0],
                    ['ElectricShock', sql.Bit, ElectricShock === 'true' ? 1 : 0],
                    ['ElectricFireExplosion', sql.Bit, ElectricFireExplosion === 'true' ? 1 : 0],
                    ['FaultyTools', sql.Bit, FaultyTools === 'true' ? 1 : 0],
                    ['ArcFlash', sql.Bit, ArcFlash === 'true' ? 1 : 0],
                    ['ElectricalBurn', sql.Bit, ElectricalBurn === 'true' ? 1 : 0],
                    ['ElectricalFire', sql.Bit, ElectricalFire === 'true' ? 1 : 0],
                    ['SafetyHelmet', sql.Bit, SafetyHelmet === 'true' ? 1 : 0],
                    ['SafetyJacket', sql.Bit, SafetyJacket === 'true' ? 1 : 0],
                    ['SafetyShoes', sql.Bit, SafetyShoes === 'true' ? 1 : 0],
                    ['InsulatedGloves', sql.Bit, InsulatedGloves === 'true' ? 1 : 0],
                    ['FireResistanceCloth', sql.Bit, FireResistanceCloth === 'true' ? 1 : 0],
                    ['ShockProofBoot', sql.Bit, ShockProofBoot === 'true' ? 1 : 0],
                    ['InsulatedMat', sql.Bit, InsulatedMat === 'true' ? 1 : 0],
                    ['InsulatedHandGloves', sql.Bit, InsulatedHandGloves === 'true' ? 1 : 0],
                    ['FireExtinguishers', sql.Bit, FireExtinguishers === 'true' ? 1 : 0],
                    ['MachineId', sql.NVarChar(100), MachineId],
                    ['LockTagNo', sql.NVarChar(100), LockTagNo],
                    ['OtherHazards', sql.NVarChar(500), OtherHazards],
                    ['AdditionalPpe', sql.NVarChar(500), AdditionalPpe],
                    ['Issuer_Name', sql.NVarChar(100), Issuer_Name],
                    ['Issuer_Designation', sql.NVarChar(100), Issuer_Designation],
                    ['Issuer_DateTime', sql.DateTime, Issuer_DateTime],
                    ['Issuer_UpdatedBy', sql.NVarChar(100), Issuer_UpdatedBy],
                    ['Receiver_Name', sql.NVarChar(100), Receiver_Name],
                    ['Receiver_Designation', sql.NVarChar(100), Receiver_Designation],
                    ['Receiver_DateTime', sql.DateTime, Receiver_DateTime],
                    ['Receiver_UpdatedBy', sql.NVarChar(100), Receiver_UpdatedBy],
                    ['EnergyIsolate_Name', sql.NVarChar(100), EnergyIsolate_Name],
                    ['EnergyIsolate_Designation', sql.NVarChar(100), EnergyIsolate_Designation],
                    ['EnergyIsolate_DateTime', sql.DateTime, EnergyIsolate_DateTime],
                    ['EnergyIsolate_UpdatedBy', sql.NVarChar(100), EnergyIsolate_UpdatedBy],
                    ['Reviewer_Name', sql.NVarChar(100), Reviewer_Name],
                    ['Reviewer_Designation', sql.NVarChar(100), Reviewer_Designation],
                    ['Reviewer_DateTime', sql.DateTime, Reviewer_DateTime],
                    ['Reviewer_UpdatedBy', sql.NVarChar(100), Reviewer_UpdatedBy],
                    ['Approver_Name', sql.NVarChar(100), Approver_Name],
                    ['Approver_Designation', sql.NVarChar(100), Approver_Designation],
                    ['Approver_DateTime', sql.DateTime, Approver_DateTime],
                    ['Approver_UpdatedBy', sql.NVarChar(100), Approver_UpdatedBy],
                    ['IsolationRequired', sql.Bit, IsolationRequired === 'true' ? 1 : 0],
                    ['Reason', sql.NVarChar(200), Reason]
                ];
                break;
            case 4: // GeneralWorkPermit
                updateQuery = `
                    UPDATE GeneralWorkPermit SET
                        PermitDate = @PermitDate,
                        NearestFireAlarmPoint = @NearestFireAlarmPoint,
                        TotalEngagedWorkers = @TotalEngagedWorkers,
                        WorkLocation = @WorkLocation,
                        WorkDescription = @WorkDescription,
                        PermitValidUpTo = @PermitValidUpTo,
                        Organization = @Organization,
                        SupervisorName = @SupervisorName,
                        ContactNumber = @ContactNumber,
                        Remarks = @Remarks,
                        Updated_by = @Updated_by,
                        Updated_on = @Updated_on,
                        WorkAreaInspected = @WorkAreaInspected,
                        SurroundingAreaChecked = @SurroundingAreaChecked,
                        WorkersInstructed = @WorkersInstructed,
                        WarningSigns = @WarningSigns,
                        EquipmentDrained = @EquipmentDrained,
                        LockoutTagout = @LockoutTagout,
                        NoiseDust = @NoiseDust,
                        SlipTripFall = @SlipTripFall,
                        VehicleHazards = @VehicleHazards,
                        FallingObjects = @FallingObjects,
                        ManualHandling = @ManualHandling,
                        LackOfOxygen = @LackOfOxygen,
                        BiologicalHazards = @BiologicalHazards,
                        ElectricalHazards = @ElectricalHazards,
                        CombustibleGases = @CombustibleGases,
                        SafetyHelmet = @SafetyHelmet,
                        SafetyJacket = @SafetyJacket,
                        SafetyShoes = @SafetyShoes,
                        Gloves = @Gloves,
                        SafetyGoggles = @SafetyGoggles,
                        FaceShield = @FaceShield,
                        DustMask = @DustMask,
                        EarPlugEarmuff = @EarPlugEarmuff,
                        AntiSlipFootwear = @AntiSlipFootwear,
                        GumBoot = @GumBoot,
                        ThermalCloth = @ThermalCloth,
                        MachineId = @MachineId,
                        LockTagNo = @LockTagNo,
                        OtherHazards = @OtherHazards,
                        AdditionalPpe = @AdditionalPpe,
                        Issuer_Name = @Issuer_Name,
                        Issuer_Designation = @Issuer_Designation,
                        Issuer_DateTime = @Issuer_DateTime,
                        Issuer_UpdatedBy = @Issuer_UpdatedBy,
                        Receiver_Name = @Receiver_Name,
                        Receiver_Designation = @Receiver_Designation,
                        Receiver_DateTime = @Receiver_DateTime,
                        Receiver_UpdatedBy = @Receiver_UpdatedBy,
                        EnergyIsolate_Name = @EnergyIsolate_Name,
                        EnergyIsolate_Designation = @EnergyIsolate_Designation,
                        EnergyIsolate_DateTime = @EnergyIsolate_DateTime,
                        EnergyIsolate_UpdatedBy = @EnergyIsolate_UpdatedBy,
                        Reviewer_Name = @Reviewer_Name,
                        Reviewer_Designation = @Reviewer_Designation,
                        Reviewer_DateTime = @Reviewer_DateTime,
                        Reviewer_UpdatedBy = @Reviewer_UpdatedBy,
                        Approver_Name = @Approver_Name,
                        Approver_Designation = @Approver_Designation,
                        Approver_DateTime = @Approver_DateTime,
                        Approver_UpdatedBy = @Approver_UpdatedBy,
                        IsolationRequired = @IsolationRequired,
                        Reason = @Reason
                    WHERE PermitId = @PermitId
                `;
                inputs = [
                    ['PermitId', sql.Int, id],
                    ['PermitDate', sql.DateTime, PermitDate],
                    ['NearestFireAlarmPoint', sql.NVarChar(255), NearestFireAlarmPoint],
                    ['TotalEngagedWorkers', sql.Int, TotalEngagedWorkers],
                    ['WorkLocation', sql.NVarChar(255), WorkLocation],
                    ['WorkDescription', sql.NVarChar(sql.MAX), WorkDescription],
                    ['PermitValidUpTo', sql.DateTime, PermitValidUpTo],
                    ['Organization', sql.NVarChar(255), Organization],
                    ['SupervisorName', sql.NVarChar(255), SupervisorName],
                    ['ContactNumber', sql.NVarChar(50), ContactNumber],
                    ['Remarks', sql.NVarChar(sql.MAX), Remarks],
                    ['Updated_by', sql.NVarChar(100), Updated_by],
                    ['Updated_on', sql.DateTime, new Date()],
                    ['WorkAreaInspected', sql.Bit, WorkAreaInspected === 'true' ? 1 : 0],
                    ['SurroundingAreaChecked', sql.Bit, SurroundingAreaChecked === 'true' ? 1 : 0],
                    ['WorkersInstructed', sql.Bit, WorkersInstructed === 'true' ? 1 : 0],
                    ['WarningSigns', sql.Bit, WarningSigns === 'true' ? 1 : 0],
                    ['EquipmentDrained', sql.Bit, EquipmentDrained === 'true' ? 1 : 0],
                    ['LockoutTagout', sql.Bit, LockoutTagout === 'true' ? 1 : 0],
                    ['NoiseDust', sql.Bit, NoiseDust === 'true' ? 1 : 0],
                    ['SlipTripFall', sql.Bit, SlipTripFall === 'true' ? 1 : 0],
                    ['VehicleHazards', sql.Bit, VehicleHazards === 'true' ? 1 : 0],
                    ['FallingObjects', sql.Bit, FallingObjects === 'true' ? 1 : 0],
                    ['ManualHandling', sql.Bit, ManualHandling === 'true' ? 1 : 0],
                    ['LackOfOxygen', sql.Bit, LackOfOxygen === 'true' ? 1 : 0],
                    ['BiologicalHazards', sql.Bit, BiologicalHazards === 'true' ? 1 : 0],
                    ['ElectricalHazards', sql.Bit, ElectricalHazards === 'true' ? 1 : 0],
                    ['CombustibleGases', sql.Bit, CombustibleGases === 'true' ? 1 : 0],
                    ['SafetyHelmet', sql.Bit, SafetyHelmet === 'true' ? 1 : 0],
                    ['SafetyJacket', sql.Bit, SafetyJacket === 'true' ? 1 : 0],
                    ['SafetyShoes', sql.Bit, SafetyShoes === 'true' ? 1 : 0],
                    ['Gloves', sql.Bit, Gloves === 'true' ? 1 : 0],
                    ['SafetyGoggles', sql.Bit, SafetyGoggles === 'true' ? 1 : 0],
                    ['FaceShield', sql.Bit, FaceShield === 'true' ? 1 : 0],
                    ['DustMask', sql.Bit, DustMask === 'true' ? 1 : 0],
                    ['EarPlugEarmuff', sql.Bit, EarPlugEarmuff === 'true' ? 1 : 0],
                    ['AntiSlipFootwear', sql.Bit, AntiSlipFootwear === 'true' ? 1 : 0],
                    ['GumBoot', sql.Bit, GumBoot === 'true' ? 1 : 0],
                    ['ThermalCloth', sql.Bit, ThermalCloth === 'true' ? 1 : 0],
                    ['MachineId', sql.NVarChar(100), MachineId],
                    ['LockTagNo', sql.NVarChar(100), LockTagNo],
                    ['OtherHazards', sql.NVarChar(500), OtherHazards],
                    ['AdditionalPpe', sql.NVarChar(500), AdditionalPpe],
                    ['Issuer_Name', sql.NVarChar(100), Issuer_Name],
                    ['Issuer_Designation', sql.NVarChar(100), Issuer_Designation],
                    ['Issuer_DateTime', sql.DateTime, Issuer_DateTime],
                    ['Issuer_UpdatedBy', sql.NVarChar(100), Issuer_UpdatedBy],
                    ['Receiver_Name', sql.NVarChar(100), Receiver_Name],
                    ['Receiver_Designation', sql.NVarChar(100), Receiver_Designation],
                    ['Receiver_DateTime', sql.DateTime, Receiver_DateTime],
                    ['Receiver_UpdatedBy', sql.NVarChar(100), Receiver_UpdatedBy],
                    ['EnergyIsolate_Name', sql.NVarChar(100), EnergyIsolate_Name],
                    ['EnergyIsolate_Designation', sql.NVarChar(100), EnergyIsolate_Designation],
                    ['EnergyIsolate_DateTime', sql.DateTime, EnergyIsolate_DateTime],
                    ['EnergyIsolate_UpdatedBy', sql.NVarChar(100), EnergyIsolate_UpdatedBy],
                    ['Reviewer_Name', sql.NVarChar(100), Reviewer_Name],
                    ['Reviewer_Designation', sql.NVarChar(100), Reviewer_Designation],
                    ['Reviewer_DateTime', sql.DateTime, Reviewer_DateTime],
                    ['Reviewer_UpdatedBy', sql.NVarChar(100), Reviewer_UpdatedBy],
                    ['Approver_Name', sql.NVarChar(100), Approver_Name],
                    ['Approver_Designation', sql.NVarChar(100), Approver_Designation],
                    ['Approver_DateTime', sql.DateTime, Approver_DateTime],
                    ['Approver_UpdatedBy', sql.NVarChar(100), Approver_UpdatedBy],
                    ['IsolationRequired', sql.Bit, IsolationRequired === 'true' ? 1 : 0],
                    ['Reason', sql.NVarChar(200), Reason]
                ];
                break;
            default:
                return res.status(400).json({ error: 'Invalid PermitTypeId' });
        }

        // Restrict updates to only the fields that belong to the user's role
        if (!UserId) {
            return res.status(400).json({ error: 'UserId is required to determine role for role-based updates' });
        }

        const userRow = await pool.request()
            .input('UserId', sql.Int, UserId)
            .query('SELECT RoleId FROM UserMaster WHERE UserId = @UserId AND IsActive = 1 AND DelMark = 0');

        if (userRow.recordset.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const roleId = userRow.recordset[0].RoleId;
        // Build mapping for which role-specific fields we will update.
        // We will NOT update any _Name or _Designation fields here. Instead we store
        // the acting user's id in the *_UpdatedBy field and the current timestamp in *_DateTime.
        const roleFieldMap = {
            2: ['Receiver_DateTime','Receiver_UpdatedBy'],
            3: ['Reviewer_DateTime','Reviewer_UpdatedBy'],
            4: ['Approver_DateTime','Approver_UpdatedBy'],
            5: ['EnergyIsolate_DateTime','EnergyIsolate_UpdatedBy']
        };

        const allowedFields = roleFieldMap[roleId] || [];

        // Remove all _Name and _Designation assignments from the update SQL (we won't set those here)
        const alwaysStrip = [
            'Issuer_Name','Issuer_Designation',
            'Receiver_Name','Receiver_Designation',
            'EnergyIsolate_Name','EnergyIsolate_Designation',
            'Reviewer_Name','Reviewer_Designation',
            'Approver_Name','Approver_Designation'
        ];

        let filteredQuery = updateQuery;
        for (const f of alwaysStrip) {
            const re = new RegExp('\\b' + f + '\\s*=\\s*@' + f + '\\s*,?', 'g');
            filteredQuery = filteredQuery.replace(re, '');
        }

        // Remove any role-specific fields that the current user should not update
        const allRoleFields = Array.prototype.concat.apply([], Object.values(roleFieldMap));
        for (const f of allRoleFields) {
            if (!allowedFields.includes(f)) {
                const re = new RegExp('\\b' + f + '\\s*=\\s*@' + f + '\\s*,?', 'g');
                filteredQuery = filteredQuery.replace(re, '');
            }
        }

        // Cleanup any leftover commas before WHERE or double commas
        filteredQuery = filteredQuery.replace(/,\s*WHERE/gi, ' WHERE');
        filteredQuery = filteredQuery.replace(/,\s*,/g, ',');
        filteredQuery = filteredQuery.replace(/SET\s*,/i, 'SET ');

        updateQuery = filteredQuery;
        console.log('Final Update Query:', updateQuery);

        const currentDateTime = new Date();
        const currentUpdatedBy = UserId ? String(UserId) : null;

        // Inject values for allowed fields (only DateTime and UpdatedBy)
        for (const f of allowedFields) {
            for (let i = 0; i < inputs.length; i++) {
                if (inputs[i][0] === f) {
                    if (f.endsWith('_DateTime')) inputs[i][2] = currentDateTime;
                    else if (f.endsWith('_UpdatedBy')) inputs[i][2] = currentUpdatedBy;
                    break;
                }
            }
        }

        const request = pool.request();
        for (const [name, type, value] of inputs) {
            if (value !== undefined && value !== null) {
                request.input(name, type, value);
            } else {
                request.input(name, type, null);
            }
        }
        await request.query(updateQuery);

        // Handle file uploads
        const uploadedFiles = req.files || [];
        if (uploadedFiles.length > 0) {
            for (const file of uploadedFiles) {
                await pool.request()
                    .input('PermitId', sql.Int, id)
                    .input('FileName', sql.NVarChar(255), file.originalname)
                    .input('FileSize', sql.BigInt, file.size)
                    .input('FileType', sql.NVarChar(100), file.mimetype)
                    .input('FileData', sql.VarBinary(sql.MAX), file.buffer)
                    .input('UploadDate', sql.DateTime, new Date())
                    .query(`
                        INSERT INTO PERMIT_FILES (PermitId, FileName, FileSize, FileType, FileData, UploadDate)
                        VALUES (@PermitId, @FileName, @FileSize, @FileType, @FileData, @UploadDate)
                    `);
            }
        }

        // Fetch updated permit for response
        const permitResult = await pool.request()
            .input('PermitId', sql.Int, id)
            .query(`
                SELECT p.*, 
                       upm.CurrentPermitStatus,
                       upm.Status as PermitStatus,
                       (SELECT COUNT(*) FROM PERMIT_FILES f WHERE f.PermitID = p.PermitId) as FileCount
                FROM PermitMaster p
                INNER JOIN UserPermitMaster upm ON p.PermitId = upm.PermitId
                WHERE p.PermitId = @PermitId AND upm.IsActive = 1 AND upm.DelMark = 0
            `);

        if (permitResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Permit not found' });
        }

        const permit = permitResult.recordset[0];

        // Fetch type-specific details
        let detailsQuery = '';
        switch (Number(PermitTypeId)) {
            case 1:
                detailsQuery = `SELECT * FROM HeightWorkPermit WHERE PermitId = @PermitId`;
                break;
            case 2:
                detailsQuery = `SELECT * FROM HotWorkPermit WHERE PermitId = @PermitId`;
                break;
            case 3:
                detailsQuery = `SELECT * FROM ElectricWorkPermit WHERE PermitId = @PermitId`;
                break;
            case 4:
                detailsQuery = `SELECT * FROM GeneralWorkPermit WHERE PermitId = @PermitId`;
                break;
        }

        const detailsResult = await pool.request()
            .input('PermitId', sql.Int, id)
            .query(detailsQuery);

        const details = detailsResult.recordset[0] || {};

        // Flatten details into root object, skipping redundant fields
        const redundantFields = ['PermitId', 'PermitNumber'];
        for (const key in details) {
            if (details.hasOwnProperty(key) && !redundantFields.includes(key)) {
                permit[key] = details[key];
            }
        }

        // Fetch files
        const filesResult = await pool.request()
            .input('PermitId', sql.Int, id)
            .query('SELECT FileID, FileName, FileSize, FileType, UploadDate FROM PERMIT_FILES WHERE PermitID = @PermitId ORDER BY UploadDate DESC');

        permit.Files = filesResult.recordset;

        res.json({
            message: 'Permit updated successfully',
            newFilesUploaded: uploadedFiles.length,
            permit
        });
    } catch (error) {
        console.error('Error updating permit:', error);
        // Clean up uploaded files if database operation failed
        if (req.files && req.files.length > 0) {
            const fs = require('fs');
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }
        res.status(500).json({ error: 'Failed to update permit: ' + error.message });
    }
};

// Delete permit
const deletePermit = async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await poolPromise;
        
        // Delete permit (cascade will delete associated files from database)
        const result = await pool.request()
            .input('PermitID', sql.Int, id)
            .query('DELETE FROM WORK_PERMIT WHERE PermitID = @PermitID');
        
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Permit not found' });
        }
        
        res.json({ message: 'Permit deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete permit' });
    }
};

// API: Get all close documents (metadata) from PermitCloseAttachment by PermitId
// Returns Documents array and uploader info (UserId, UserName) from UserMaster
const getCloseDocumentByPermitId = async (req, res) => {
    try {
        const { permitId } = req.params;
        const permitIdNumber = parseInt(permitId, 10);
        if (isNaN(permitIdNumber) || permitIdNumber <= 0) {
            return res.status(400).json({ error: 'Invalid PermitId. Must be a positive number.' });
        }

        const pool = await poolPromise;
        // Get all active, non-deleted close documents for this permit, include uploader info from UserMaster
        const result = await pool.request()
            .input('PermitId', sql.Int, permitIdNumber)
            .query(`
                SELECT pca.*, um.UserId AS UploadedUserId, 
                       COALESCE(um.UserName, um.MailId) AS UploadedUserName
                FROM PermitCloseAttachment pca
                LEFT JOIN UserMaster um ON TRY_CONVERT(INT, pca.CreatedBy) = um.UserId
                WHERE pca.PermitId = @PermitId AND pca.IsActive = 1 AND pca.DelMark = 0
                ORDER BY pca.CreatedOn DESC
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'No close documents found for this permit' });
        }

        const records = [];
        for (const row of result.recordset) {
            let docs = [];
            try {
                docs = JSON.parse(row.Documents || '[]');
            } catch (e) {
                // ignore parse error and return empty array for this record
                docs = [];
            }

            records.push({
                attachmentId: row.PermitCloseAttachmentId || row.Id || null,
                permitId: row.PermitId,
                documents: docs,
                FileData: row.FileData || null,
                createdBy: row.CreatedBy,
                createdOn: row.CreatedOn,
                uploadedBy: {
                    userId: row.UploadedUserId || null,
                    userName: row.UploadedUserName || null
                }
            });
        }
        console.log('Fetched close documents:', records);
        return res.json(records);
    } catch (error) {
        console.error('Error fetching close documents:', error);
        res.status(500).json({ error: 'Failed to fetch close documents' });
    }
};

// Delete specific file
const deleteFile = async (req, res) => {
    try {
        const { fileId } = req.params;
        const pool = await poolPromise;
        
        // Delete from database
        const result = await pool.request()
            .input('FileID', sql.Int, fileId)
            .query('DELETE FROM PERMIT_FILES WHERE FileID = @FileID');
        
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
};

// Hold permit and send email notification
const holdPermit = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason,PermitTypeId } = req.body;
        const pool = await poolPromise;

        if (!id || isNaN(id)) {
            return res.status(400).json({ error: 'Invalid Permit ID' });
        }
        if (!reason) {
            return res.status(400).json({ error: 'Reason is required' });
        }
        if (!PermitTypeId || isNaN(PermitTypeId)) {
            return res.status(400).json({ error: 'Valid PermitTypeId is required' });
        }

        const tableMap = {
            1: 'HeightWorkPermit',
            2: 'HotWorkPermit',
            3: 'ElectricWorkPermit',
            4: 'GeneralWorkPermit'
        };

        const tableName = tableMap[PermitTypeId];
        if (!tableName) {
            return res.status(400).json({ error: 'Invalid PermitTypeId' });
        }
        
        // Update the REASON field in WORK_PERMIT
            const updateResult = await pool.request()
            .input('PermitId', sql.Int, id)
            .input('Reason', sql.NVarChar, reason)
            .query(`UPDATE ${tableName} SET REASON = @Reason WHERE PermitId = @PermitId`);

        // Also set CurrentPermitStatus to 'Hold' in UserPermitMaster
        await pool.request()
            .input('PermitId', sql.Int, id)
            .query("UPDATE UserPermitMaster SET CurrentPermitStatus = 'Hold' WHERE PermitId = @PermitId");

        if (updateResult.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Permit not found' });
        }
        
// Get permit details including user emails and reason
const permitResult = await pool.request()
    .input('PermitId', sql.Int, id)
    .query(`
        SELECT 
            pm.PermitNumber, 
            wp.WorkLocation, 
            wp.WorkDescription, 
            wp.REASON,
            issuer.MailId AS IssuerEmail, 
            receiver.MailId AS ReceiverEmail, 
            reviewer.MailId AS ReviewerEmail, 
            approver.MailId AS ApproverEmail
        FROM ${tableName} wp
        INNER JOIN PermitMaster pm ON wp.PermitId = pm.PermitId
        LEFT JOIN UserMaster issuer ON wp.Issuer_UpdatedBy = CAST(issuer.UserId AS NVARCHAR(100))
        LEFT JOIN UserMaster receiver ON wp.Receiver_UpdatedBy = CAST(receiver.UserId AS NVARCHAR(100))
        LEFT JOIN UserMaster reviewer ON wp.Reviewer_UpdatedBy = CAST(reviewer.UserId AS NVARCHAR(100))
        LEFT JOIN UserMaster approver ON wp.Approver_UpdatedBy = CAST(approver.UserId AS NVARCHAR(100))
        WHERE wp.PermitId = @PermitId
    `);

if (permitResult.recordset.length === 0) {
    return res.status(404).json({ error: 'Permit details not found' });
}

const permit = permitResult.recordset[0];

// Collect all valid email addresses
const recipientEmails = [
    permit.ReceiverEmail,
    permit.IssuerEmail,
    permit.ReviewerEmail,
    permit.ApproverEmail
].filter(email => email && email.trim() !== '').map(email => email.trim());

if (recipientEmails.length === 0) {
    console.warn(`No valid email addresses found for PermitId: ${id} (On Hold notification)`);
    // You can choose to continue or fail here depending on your requirements
}

// Common HTML email body
const getEmailHtml = () => `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9; }
            h2 { color: #e74c3c; } /* Red color to indicate hold */
            strong { color: #2c3e50; }
            .reason { background: #fff3cd; padding: 12px; border-left: 4px solid #ffc107; margin: 15px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Work Permit Put On Hold</h2>
            <p>Dear Team Member,</p>
            <p>The following work permit has been <strong>put on hold</strong>:</p>
            
            <p><strong>Permit Number:</strong> ${permit.PermitNumber}</p>
            <p><strong>Location:</strong> ${permit.WorkLocation || 'N/A'}</p>
            <p><strong>Work Description:</strong> ${permit.WorkDescription || 'N/A'}</p>
            
            <div class="reason">
                <strong>Reason for Hold:</strong><br>
                ${permit.REASON || 'No reason provided.'}
            </div>
            
            <p>Please check the system for updates or contact the relevant authority for clarification.</p>
            <p>Thank you.<br><em>Work Permit System</em></p>
        </div>
    </body>
    </html>
`;

// Send individual email to each recipient
const emailPromises = recipientEmails.map(async (email) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `Work Permit ${permit.PermitNumber} Put On Hold`,
        html: getEmailHtml()
    };

    try {
         transporter.sendMail(mailOptions);
        console.log(`'On Hold' email sent to: ${email} for Permit ${permit.PermitNumber}`);
    } catch (error) {
        console.error(`Failed to send 'On Hold' email to ${email}:`, error);
    }
});
         Promise.all(emailPromises);
        
        res.json({ 
            message: 'Your has been put on hold and notification emails have been sent',
            permitId: id
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to put permit on hold: ' + error.message });
    }
};

// API: Reject a permit and send email notification
const rejectPermit = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, PermitTypeId } = req.body;
        const pool = await poolPromise;

        if (!id || isNaN(id)) {
            return res.status(400).json({ error: 'Invalid Permit ID' });
        }
        if (!reason) {
            return res.status(400).json({ error: 'Reason is required' });
        }
        if (!PermitTypeId || isNaN(PermitTypeId)) {
            return res.status(400).json({ error: 'Valid PermitTypeId is required' });
        }

        const tableMap = {
            1: 'HeightWorkPermit',
            2: 'HotWorkPermit',
            3: 'ElectricWorkPermit',
            4: 'GeneralWorkPermit'
        };

        const tableName = tableMap[PermitTypeId];
        if (!tableName) {
            return res.status(400).json({ error: 'Invalid PermitTypeId' });
        }

        // Update the Reason field in the specific permit table
        const updateResult = await pool.request()
            .input('PermitId', sql.Int, id)
            .input('Reason', sql.NVarChar, reason)
            .query(`UPDATE ${tableName} SET Reason = @Reason WHERE PermitId = @PermitId`);

        // Set CurrentPermitStatus to 'Rejected' in UserPermitMaster
        await pool.request()
            .input('PermitId', sql.Int, id)
            .query("UPDATE UserPermitMaster SET CurrentPermitStatus = 'Rejected' WHERE PermitId = @PermitId");

        if (updateResult.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Permit not found' });
        }

        // Get permit details for the email
        const permitResult = await pool.request()
            .input('PermitId', sql.Int, id)
            .query(`
                SELECT pm.PermitNumber, pm.PermitTypeId, wp.WorkLocation, wp.WorkDescription, wp.Reason, wp.Approver_UpdatedBy
                FROM ${tableName} wp
                INNER JOIN PermitMaster pm ON wp.PermitId = pm.PermitId
                WHERE wp.PermitId = @PermitId
            `);

        if (permitResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Permit details not found' });
        }

        const permit = permitResult.recordset[0];

        // Get permit type name
        const permitTypeResult = await pool.request()
            .input('PermitTypeId', sql.Int, permit.PermitTypeId)
            .query('SELECT PermitType FROM PermitTypeMaster WHERE PermitTypeId = @PermitTypeId');

        const permitType = permitTypeResult.recordset.length > 0 ? permitTypeResult.recordset[0].PermitType : 'Work Permit';

        // Get approver's email from UserMaster if available
        let emailRecipients = [];

        if (permit.Approver_UpdatedBy) {
            const approverResult = await pool.request()
                .input('UserId', sql.Int, parseInt(permit.Approver_UpdatedBy, 10))
                .query('SELECT Email FROM UserMaster WHERE UserId = @UserId AND IsActive = 1 AND DelMark = 0');

            if (approverResult.recordset.length > 0 && approverResult.recordset[0].Email) {
                emailRecipients.push(approverResult.recordset[0].Email);
            }
        }

        // If no approver found, add default admin emails
        if (emailRecipients.length === 0) {
            emailRecipients = ['Mukund.Kumar@hindterminals.com', 'amit.singh@elogisol.in', 'dinesh.gautam@elogisol.in', 'info@elogisol.in', 'avinashtiwari5322@gmail.com'];
        }

        // Send email notification
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: emailRecipients.join(','),
            subject: `Work Permit Rejected - ${permit.PermitNumber}`,
            html: `
                <h2>Work Permit Has Been Rejected</h2>
                <p><strong>Permit Number:</strong> ${permit.PermitNumber}</p>
                <p><strong>Permit Type:</strong> ${permitType}</p>
                <p><strong>Location:</strong> ${permit.WorkLocation}</p>
                <p><strong>Work Description:</strong> ${permit.WorkDescription}</p>
                <p><strong>Reason for Rejection:</strong> ${permit.Reason}</p>
                <p>Please review the permit and take necessary action.</p>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Permit rejection notification email sent to: ${emailRecipients.join(', ')}`);

        res.json({
            message: 'Permit rejected successfully and notification emails have been sent',
            permitId: id,
            permitNumber: permit.PermitNumber
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to reject permit: ' + error.message });
    }
};

// API: Reopen an expired permit (creates a new permit with all data from old permit)
const reopenPermit = async (req, res) => {
    try {
        const { ExpiredPermitId, UserId, PermitValidUpTo } = req.body;
        console.log('Reopen Permit Request Body:', req.body);

        if (!ExpiredPermitId || isNaN(ExpiredPermitId)) {
            return res.status(400).json({ error: 'Valid ExpiredPermitId is required' });
        }
        if (!UserId || isNaN(UserId)) {
            return res.status(400).json({ error: 'Valid UserId is required' });
        }
        if (!PermitValidUpTo) {
            return res.status(400).json({ error: 'PermitValidUpTo date is required' });
        }

        // Validate and parse the new PermitValidUpTo date
        let newValidUpTo;
        try {
            newValidUpTo = new Date(PermitValidUpTo);
            if (isNaN(newValidUpTo.getTime())) {
                return res.status(400).json({ error: 'Invalid PermitValidUpTo date format' });
            }
        } catch (e) {
            return res.status(400).json({ error: 'Invalid PermitValidUpTo date format' });
        }

        const pool = await poolPromise;
        const expiredPermitId = parseInt(ExpiredPermitId, 10);
        const userId = parseInt(UserId, 10);
        const userIdString = String(userId);

        // Fetch the expired permit from PermitMaster and its type
        const expiredPermitResult = await pool.request()
            .input('PermitId', sql.Int, expiredPermitId)
            .query(`
                SELECT pm.PermitId, pm.PermitTypeId, pm.PermitNumber, pm.CreatedBy, pm.ReferencePermitId, pm.IsReopened
                FROM PermitMaster pm
                WHERE pm.PermitId = @PermitId AND pm.IsActive = 1 AND pm.DelMark = 0
            `);

        if (expiredPermitResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Expired permit not found' });
        }

        const expiredPermit = expiredPermitResult.recordset[0];
        const permitTypeId = expiredPermit.PermitTypeId;

        // Map PermitTypeId to table name
        const tableMap = {
            1: 'HeightWorkPermit',
            2: 'HotWorkPermit',
            3: 'ElectricWorkPermit',
            4: 'GeneralWorkPermit'
        };

        const tableName = tableMap[permitTypeId];
        if (!tableName) {
            return res.status(400).json({ error: 'Invalid PermitTypeId' });
        }

        // Fetch all details from the specific permit table
        const permitDetailsResult = await pool.request()
            .input('PermitId', sql.Int, expiredPermitId)
            .query(`SELECT * FROM ${tableName} WHERE PermitId = @PermitId`);

        if (permitDetailsResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Permit details not found' });
        }

        const permitDetails = permitDetailsResult.recordset[0];

        // Generate new PermitNumber for the reopened permit
        // Extract location from existing permit
        const existingPermitNumber = expiredPermit.PermitNumber; // e.g., "HTPL/LOCATION/2025-26/1"
        const parts = existingPermitNumber.split('/');
        const locNorm = parts.length >= 2 ? parts[1] : 'UNKNOWN';

        // Fiscal year for new permit
        const now = new Date();
        const month = now.getMonth() + 1;
        let startYear = now.getFullYear();
        if (month < 4) startYear = startYear - 1;
        const endYear = startYear + 1;
        const fiscal = `${startYear}-${String(endYear).slice(-2)}`;

        const prefix = `HTPL/${locNorm}/${fiscal}/`;

        // Find latest numeric suffix for this prefix
        let nextSeq = 1;
        try {
            const existing = await pool.request()
                .input('LikePattern', sql.NVarChar(200), prefix + '%')
                .query('SELECT PermitNumber FROM PermitMaster WHERE PermitNumber LIKE @LikePattern ORDER BY PermitId DESC');

            if (existing.recordset && existing.recordset.length > 0) {
                for (const row of existing.recordset) {
                    const pn = row.PermitNumber || '';
                    const splitParts = pn.split('/');
                    const last = splitParts[splitParts.length - 1];
                    const num = parseInt((last || '').replace(/^0+/, ''), 10);
                    if (!isNaN(num) && num >= nextSeq) {
                        nextSeq = num + 1;
                        break;
                    }
                }
            }
        } catch (e) {
            console.error('Error fetching existing PermitNumbers for reopen:', e && e.message ? e.message : e);
        }

        // Ensure generated PermitNumber is unique
        let generatedPermitNumber = `${prefix}${nextSeq}`;
        try {
            let exists = true;
            let guard = 0;
            while (exists && guard < 50) {
                const check = await pool.request()
                    .input('PermitNumber', sql.NVarChar(200), generatedPermitNumber)
                    .query('SELECT PermitId FROM PermitMaster WHERE PermitNumber = @PermitNumber');
                if (check.recordset && check.recordset.length > 0) {
                    nextSeq += 1;
                    generatedPermitNumber = `${prefix}${nextSeq}`;
                    guard += 1;
                } else {
                    exists = false;
                }
            }
        } catch (e) {
            console.error('Error ensuring PermitNumber uniqueness for reopen:', e && e.message ? e.message : e);
        }

        // Create new permit in PermitMaster with ReferencePermitId set to the expired permit
        const permitMasterResult = await pool.request()
            .input('PermitTypeId', sql.Numeric(18, 0), permitTypeId)
            .input('PermitNumber', sql.NVarChar(100), generatedPermitNumber)
            .input('CreatedBy', sql.NVarChar(100), userIdString)
            .input('ReferencePermitId', sql.Int, expiredPermitId)
            .input('IsReopened', sql.Bit, 1)
            .query(`
                INSERT INTO PermitMaster (PermitTypeId, PermitNumber, CreatedBy, ReferencePermitId, IsReopened)
                OUTPUT INSERTED.PermitId
                VALUES (@PermitTypeId, @PermitNumber, @CreatedBy, @ReferencePermitId, @IsReopened)
            `);

        const newPermitId = permitMasterResult.recordset[0].PermitId;

        // Insert into specific permit table with ALL copied data from expired permit using INSERT...SELECT
        const currentDateTime = new Date();
        const issuerUpdatedBy = userIdString;

        // Use table-specific INSERT...SELECT to copy ALL columns correctly for each permit type
        // Each table has different columns so we need to specify the exact columns per table
        try {
            let copyQuery = '';
            
            if (permitTypeId === 1) { // HeightWorkPermit
                copyQuery = `
                    INSERT INTO ${tableName}
                    SELECT 
                        @NewPermitId as PermitId,
                        PermitDate,
                        NearestFireAlarmPoint,
                        TotalEngagedWorkers,
                        WorkLocation,
                        WorkDescription,
                        @NewPermitValidUpTo as PermitValidUpTo,
                        Organization,
                        SupervisorName,
                        ContactNumber,
                        Reason,
                        @CreatedBy as Created_by,
                        Created_on,
                        Updated_by,
                        Updated_on,
                        ScaffoldChecked,
                        ScaffoldTagged,
                        ScaffoldRechecked,
                        ScaffoldErected,
                        HangingBaskets,
                        PlatformSafe,
                        CatLadders,
                        EdgeProtection,
                        Platforms,
                        SafetyHarness,
                        EnergyPrecautions,
                        Illumination,
                        UnguardedAreas,
                        FallProtection,
                        AccessMeans,
                        SafetyHelmet,
                        SafetyJacket,
                        SafetyShoes,
                        Gloves,
                        SafetyGoggles,
                        FaceShield,
                        DustMask,
                        EarPlugEarmuff,
                        SafetyNet,
                        AnchorPointLifelines,
                        SelfRetractingLifeline,
                        FullBodyHarness,
                        MachineId,
                        LockTagNo,
                        AdditionalPpe,
                        Issuer_Name,
                        Issuer_Designation,
                        @CurrentDateTime as Issuer_DateTime,
                        @IssuerUpdatedBy as Issuer_UpdatedBy,
                        Receiver_Name,
                        Receiver_Designation,
                        Receiver_DateTime,
                        Receiver_UpdatedBy,
                        EnergyIsolate_Name,
                        EnergyIsolate_Designation,
                        EnergyIsolate_DateTime,
                        EnergyIsolate_UpdatedBy,
                        Reviewer_Name,
                        Reviewer_Designation,
                        Reviewer_DateTime,
                        Reviewer_UpdatedBy,
                        Approver_Name,
                        Approver_Designation,
                        Approver_DateTime,
                        Approver_UpdatedBy,
                        IsolationRequired,
                        DepartmentId,
                        AlarmPointId,
                        WorkLocationId
                    FROM ${tableName}
                    WHERE PermitId = @SourcePermitId
                `;
            } else if (permitTypeId === 2) { // HotWorkPermit
                copyQuery = `
                    INSERT INTO ${tableName}
                    SELECT 
                        @NewPermitId as PermitId,
                        PermitDate,
                        NearestFireAlarmPoint,
                        PermitNumber,
                        TotalEngagedWorkers,
                        WorkLocation,
                        WorkDescription,
                        @NewPermitValidUpTo as PermitValidUpTo,
                        Organization,
                        SupervisorName,
                        ContactNumber,
                        @CreatedBy as Created_by,
                        Created_on,
                        Updated_by,
                        Updated_on,
                        WorkAreaInspected,
                        SurroundingAreaChecked,
                        SewersCovered,
                        WarningSigns,
                        FireEquipmentAccess,
                        VentilationLighting,
                        OilGasTrapped,
                        WeldingEquipment,
                        EarthingElcb,
                        HeightPermit,
                        EquipmentDrained,
                        LockoutTagout,
                        NoiseDust,
                        SlipTripFall,
                        VehicleHazards,
                        FallingObjects,
                        ManualHandling,
                        LackOfOxygen,
                        BiologicalHazards,
                        ElectricalHazards,
                        CombustibleGases,
                        SafetyHelmet,
                        SafetyJacket,
                        SafetyShoes,
                        WeldingGloves,
                        WeldingGlasses,
                        FaceShield,
                        WeldingApron,
                        DustMask,
                        EarPlugEarmuff,
                        MachineId,
                        LockTagNo,
                        OtherHazards,
                        AdditionalPpe,
                        Issuer_Name,
                        Issuer_Designation,
                        @CurrentDateTime as Issuer_DateTime,
                        @IssuerUpdatedBy as Issuer_UpdatedBy,
                        Receiver_Name,
                        Receiver_Designation,
                        Receiver_DateTime,
                        Receiver_UpdatedBy,
                        EnergyIsolate_Name,
                        EnergyIsolate_Designation,
                        EnergyIsolate_DateTime,
                        EnergyIsolate_UpdatedBy,
                        Reviewer_Name,
                        Reviewer_Designation,
                        Reviewer_DateTime,
                        Reviewer_UpdatedBy,
                        Approver_Name,
                        Approver_Designation,
                        Approver_DateTime,
                        Approver_UpdatedBy,
                        status,
                        IsolationRequired,
                        Reason,
                        DepartmentId,
                        AlarmPointId,
                        WorkLocationId
                    FROM ${tableName}
                    WHERE PermitId = @SourcePermitId
                `;
            } else if (permitTypeId === 3) { // ElectricWorkPermit
                copyQuery = `
                    INSERT INTO ${tableName}
                    SELECT 
                        @NewPermitId as PermitId,
                        PermitDate,
                        NearestFireAlarmPoint,
                        TotalEngagedWorkers,
                        WorkLocation,
                        WorkDescription,
                        @NewPermitValidUpTo as PermitValidUpTo,
                        EquipmentTools,
                        Organization,
                        SupervisorName,
                        ContactNumber,
                        @CreatedBy as Created_by,
                        Created_on,
                        Updated_by,
                        Updated_on,
                        AreaInspected,
                        SurroundingChecked,
                        WarningSigns,
                        TrainedWorkers,
                        SafetyEquipment,
                        VentilationLighting,
                        CircuitBreakerOff,
                        TestingEquipment,
                        DryArea,
                        EmergencyProcedures,
                        HeightPermit,
                        DeEnergized,
                        LockoutTagout,
                        ElectricShock,
                        ElectricFireExplosion,
                        FaultyTools,
                        ArcFlash,
                        ElectricalBurn,
                        ElectricalFire,
                        SafetyHelmet,
                        SafetyJacket,
                        SafetyShoes,
                        InsulatedGloves,
                        FireResistanceCloth,
                        ShockProofBoot,
                        InsulatedMat,
                        InsulatedHandGloves,
                        FireExtinguishers,
                        MachineId,
                        LockTagNo,
                        OtherHazards,
                        AdditionalPpe,
                        Issuer_Name,
                        Issuer_Designation,
                        @CurrentDateTime as Issuer_DateTime,
                        @IssuerUpdatedBy as Issuer_UpdatedBy,
                        Receiver_Name,
                        Receiver_Designation,
                        Receiver_DateTime,
                        Receiver_UpdatedBy,
                        EnergyIsolate_Name,
                        EnergyIsolate_Designation,
                        EnergyIsolate_DateTime,
                        EnergyIsolate_UpdatedBy,
                        Reviewer_Name,
                        Reviewer_Designation,
                        Reviewer_DateTime,
                        Reviewer_UpdatedBy,
                        Approver_Name,
                        Approver_Designation,
                        Approver_DateTime,
                        Approver_UpdatedBy,
                        status,
                        IsolationRequired,
                        Reason,
                        DepartmentId,
                        AlarmPointId,
                        WorkLocationId
                    FROM ${tableName}
                    WHERE PermitId = @SourcePermitId
                `;
            } else if (permitTypeId === 4) { // GeneralWorkPermit
                copyQuery = `
                    INSERT INTO ${tableName}
                    SELECT 
                        @NewPermitId as PermitId,
                        PermitDate,
                        NearestFireAlarmPoint,
                        PermitNumber,
                        TotalEngagedWorkers,
                        WorkLocation,
                        WorkDescription,
                        @NewPermitValidUpTo as PermitValidUpTo,
                        Organization,
                        SupervisorName,
                        ContactNumber,
                        Remarks,
                        @CreatedBy as Created_by,
                        Created_on,
                        Updated_by,
                        Updated_on,
                        WorkAreaInspected,
                        SurroundingAreaChecked,
                        WorkersInstructed,
                        WarningSigns,
                        EquipmentDrained,
                        LockoutTagout,
                        NoiseDust,
                        SlipTripFall,
                        VehicleHazards,
                        FallingObjects,
                        ManualHandling,
                        LackOfOxygen,
                        BiologicalHazards,
                        ElectricalHazards,
                        CombustibleGases,
                        SafetyHelmet,
                        SafetyJacket,
                        SafetyShoes,
                        Gloves,
                        SafetyGoggles,
                        FaceShield,
                        DustMask,
                        EarPlugEarmuff,
                        GumBoot,
                        AntiSlipFootwear,
                        ThermalCloth,
                        MachineId,
                        LockTagNo,
                        OtherHazards,
                        AdditionalPpe,
                        Issuer_Name,
                        Issuer_Designation,
                        @CurrentDateTime as Issuer_DateTime,
                        @IssuerUpdatedBy as Issuer_UpdatedBy,
                        Receiver_Name,
                        Receiver_Designation,
                        Receiver_DateTime,
                        Receiver_UpdatedBy,
                        EnergyIsolate_Name,
                        EnergyIsolate_Designation,
                        EnergyIsolate_DateTime,
                        EnergyIsolate_UpdatedBy,
                        Reviewer_Name,
                        Reviewer_Designation,
                        Reviewer_DateTime,
                        Reviewer_UpdatedBy,
                        Approver_Name,
                        Approver_Designation,
                        Approver_DateTime,
                        Approver_UpdatedBy,
                        status,
                        IsolationRequired,
                        Reason,
                        DepartmentId,
                        AlarmPointId,
                        WorkLocationId
                    FROM ${tableName}
                    WHERE PermitId = @SourcePermitId
                `;
            }

            await pool.request()
                .input('NewPermitId', sql.Numeric(18, 0), newPermitId)
                .input('SourcePermitId', sql.Int, expiredPermitId)
                .input('NewPermitValidUpTo', sql.DateTime, newValidUpTo)
                .input('CreatedBy', sql.NVarChar(100), userIdString)
                .input('CurrentDateTime', sql.DateTime, currentDateTime)
                .input('IssuerUpdatedBy', sql.NVarChar(100), issuerUpdatedBy)
                .query(copyQuery);
        } catch (e) {
            console.error(`Error copying all permit data to ${tableName} during reopen:`, e && e.message ? e.message : e);
            // If full copy fails, try a basic fallback with essential fields only
            try {
                const fallbackQuery = `
                    INSERT INTO ${tableName} (
                        PermitId, PermitDate, NearestFireAlarmPoint, TotalEngagedWorkers, WorkLocation, 
                        WorkDescription, PermitValidUpTo, Organization, SupervisorName, ContactNumber, Created_by,
                        Issuer_DateTime, Issuer_UpdatedBy
                    ) VALUES (
                        @PermitId, @PermitDate, @NearestFireAlarmPoint, @TotalEngagedWorkers, @WorkLocation, 
                        @WorkDescription, @PermitValidUpTo, @Organization, @SupervisorName, @ContactNumber, @CreatedBy,
                        @Issuer_DateTime, @Issuer_UpdatedBy
                    )`;

                await pool.request()
                    .input('PermitId', sql.Numeric(18, 0), newPermitId)
                    .input('PermitDate', sql.DateTime, permitDetails.PermitDate)
                    .input('NearestFireAlarmPoint', sql.NVarChar(255), permitDetails.NearestFireAlarmPoint)
                    .input('TotalEngagedWorkers', sql.Int, permitDetails.TotalEngagedWorkers)
                    .input('WorkLocation', sql.NVarChar(255), permitDetails.WorkLocation)
                    .input('WorkDescription', sql.NVarChar(sql.MAX), permitDetails.WorkDescription)
                    .input('PermitValidUpTo', sql.DateTime, newValidUpTo)
                    .input('Organization', sql.NVarChar(255), permitDetails.Organization)
                    .input('SupervisorName', sql.NVarChar(255), permitDetails.SupervisorName)
                    .input('ContactNumber', sql.NVarChar(50), permitDetails.ContactNumber)
                    .input('IsolationRequired', sql.Bit, permitDetails.IsolationRequired || 0)
                    .input('CreatedBy', sql.NVarChar(100), userIdString)
                    .input('Issuer_DateTime', sql.DateTime, currentDateTime)
                    .input('Issuer_UpdatedBy', sql.NVarChar(100), issuerUpdatedBy)
                    .query(fallbackQuery);
            } catch (fallbackError) {
                console.error('Fallback copy also failed:', fallbackError && fallbackError.message ? fallbackError.message : fallbackError);
                throw fallbackError;
            }
        }

        // Insert into UserPermitMaster with Active status and Pending permission
        await pool.request()
            .input('UserId', sql.Int, userId)
            .input('PermitId', sql.Numeric(18, 0), newPermitId)
            .input('CurrentPermitStatus', sql.NVarChar(50), 'Active')
            .input('Status', sql.NVarChar(50), 'Pending')
            .input('IsActive', sql.Bit, true)
            .input('DelMark', sql.Bit, false)
            .query(`
                INSERT INTO UserPermitMaster (UserId, PermitId, CurrentPermitStatus, Status, IsActive, DelMark)
                VALUES (@UserId, @PermitId, @CurrentPermitStatus, @Status, @IsActive, @DelMark)
            `);

        // Copy admin documents from the expired permit to the new permit
        try {
            const adminDocsResult = await pool.request()
                .input('PermitId', sql.Int, expiredPermitId)
                .query(`
                    SELECT Documents, FileData FROM PermitAdminAttachment 
                    WHERE PermitId = @PermitId AND IsActive = 1 AND DelMark = 0
                `);

            if (adminDocsResult.recordset && adminDocsResult.recordset.length > 0) {
                for (const adminDoc of adminDocsResult.recordset) {
                    await pool.request()
                        .input('PermitId', sql.Int, newPermitId)
                        .input('Documents', sql.NVarChar(sql.MAX), adminDoc.Documents)
                        .input('FileData', sql.VarBinary(sql.MAX), adminDoc.FileData)
                        .input('CreatedBy', sql.NVarChar(100), userIdString)
                        .query(`
                            INSERT INTO PermitAdminAttachment (PermitId, Documents, FileData, CreatedBy, IsActive, DelMark)
                            VALUES (@PermitId, @Documents, @FileData, @CreatedBy, 1, 0)
                        `);
                }
            }
        } catch (e) {
            console.error('Error copying admin documents during permit reopen:', e && e.message ? e.message : e);
            // Don't fail the entire operation if admin documents copy fails
        }

        // Copy permit files from PERMIT_FILES table from the expired permit to the new permit
        try {
            const permitFilesResult = await pool.request()
                .input('PermitId', sql.Int, expiredPermitId)
                .query(`
                    SELECT FileName, FileSize, FileType, FileData FROM PERMIT_FILES 
                    WHERE PermitID = @PermitId
                `);

            if (permitFilesResult.recordset && permitFilesResult.recordset.length > 0) {
                for (const permitFile of permitFilesResult.recordset) {
                    await pool.request()
                        .input('PermitID', sql.Int, newPermitId)
                        .input('FileName', sql.NVarChar(255), permitFile.FileName)
                        .input('FileSize', sql.BigInt, permitFile.FileSize)
                        .input('FileType', sql.NVarChar(100), permitFile.FileType)
                        .input('FileData', sql.VarBinary(sql.MAX), permitFile.FileData)
                        .input('UploadDate', sql.DateTime, new Date())
                        .query(`
                            INSERT INTO PERMIT_FILES (PermitID, FileName, FileSize, FileType, FileData, UploadDate)
                            VALUES (@PermitID, @FileName, @FileSize, @FileType, @FileData, @UploadDate)
                        `);
                }
            }
        } catch (e) {
            console.error('Error copying permit files during permit reopen:', e && e.message ? e.message : e);
            // Don't fail the entire operation if files copy fails
        }

        // Send email notification to approver/user after successful reopen
        try {
            const permitDetailsForEmail = await pool.request()
                .input('PermitId', sql.Int, newPermitId)
                .query(`
                    SELECT pm.PermitNumber, pm.PermitTypeId, wp.WorkLocation, wp.WorkDescription, wp.PermitValidUpTo, wp.Approver_UpdatedBy
                    FROM ${tableName} wp
                    INNER JOIN PermitMaster pm ON wp.PermitId = pm.PermitId
                    WHERE wp.PermitId = @PermitId
                `);

            if (permitDetailsForEmail.recordset.length > 0) {
                const permitDetails = permitDetailsForEmail.recordset[0];
                
                // Get permit type name
                const permitTypeResult = await pool.request()
                    .input('PermitTypeId', sql.Int, permitDetails.PermitTypeId)
                    .query('SELECT PermitType FROM PermitTypeMaster WHERE PermitTypeId = @PermitTypeId');
                
                const permitType = permitTypeResult.recordset.length > 0 ? permitTypeResult.recordset[0].PermitType : 'Work Permit';
                
                // Get approver's email from UserMaster using Approver_UpdatedBy (UserId)
                let emailRecipients = [];
                
                if (permitDetails.Approver_UpdatedBy) {
                    const approverResult = await pool.request()
                        .input('UserId', sql.Int, parseInt(permitDetails.Approver_UpdatedBy, 10))
                        .query('SELECT MailId FROM UserMaster WHERE UserId = @UserId AND IsActive = 1 AND DelMark = 0');
                    
                    if (approverResult.recordset.length > 0 && approverResult.recordset[0].MailId) {
                        emailRecipients.push(approverResult.recordset[0].MailId);
                    }
                }
                
                // // If no approver found or approver email not available, add default admin emails
                // if (emailRecipients.length === 0) {
                //     emailRecipients = ['Mukund.Kumar@hindterminals.com', 'amit.singh@elogisol.in', 'dinesh.gautam@elogisol.in', 'info@elogisol.in', 'avinashtiwari5322@gmail.com'];
                // }
                
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: emailRecipients.join(','),
                    subject: `Work Permit Reopened - ${permitDetails.PermitNumber}`,
                    html: `
                        <h2>Work Permit Reopened Successfully</h2>
                        <p><strong>Original Permit Number:</strong> ${expiredPermit.PermitNumber}</p>
                        <p><strong>New Permit Number:</strong> ${permitDetails.PermitNumber}</p>
                        <p><strong>Permit Type:</strong> ${permitType}</p>
                        <p><strong>Location:</strong> ${permitDetails.WorkLocation}</p>
                        <p><strong>Work Description:</strong> ${permitDetails.WorkDescription}</p>
                        <p><strong>Valid Up To:</strong> ${new Date(permitDetails.PermitValidUpTo).toLocaleDateString('en-IN')}</p>
                        <p><strong>Action:</strong> An expired permit has been reopened with a new permit number and extended validity date.</p>
                        <p>Please review the permit details in the system.</p>
                    `
                };
                
                await transporter.sendMail(mailOptions);
                console.log(`Permit reopen notification email sent successfully to: ${emailRecipients.join(', ')}`);
            }
        } catch (emailError) {
            console.error('Error sending permit reopen notification email:', emailError && emailError.message ? emailError.message : emailError);
            // Don't fail the entire operation if email sending fails
        }

        res.status(201).json({
            message: 'Permit reopened successfully',
            newPermitId: newPermitId,
            newPermitNumber: generatedPermitNumber,
            originalPermitId: expiredPermitId,
            originalPermitNumber: expiredPermit.PermitNumber
        });
    } catch (error) {
        console.error('Error reopening permit:', error);
        res.status(500).json({ error: 'Failed to reopen permit: ' + error.message });
    }
};

// GET: Fetch Permit Types
const getPermitTypes = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query("SELECT PermitTypeId, PermitType FROM PermitTypeMaster WHERE IsActive = 1 AND DelMark = 0");

        res.json(result.recordset);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch permit types.' });
    }
};

module.exports = {
    upload,
    savePermit, 
    getPermits, 
    getPermitById, 
    updatePermit,
    deletePermit,
    getFile,
    getFileById,
    getAdminDocumentByPermitId,
    getCloseDocumentByPermitId,
    deleteFile,
    holdPermit,
    rejectPermit,
    getPermitsByUser,
    uploadAdminDocument,
    approvePermit,
    closePermit,
    getPermitTypes,
    reopenPermit
};
