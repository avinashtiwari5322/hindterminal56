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
            // Basic permit information
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
            
            // Audit fields
            Created_by,
            Updated_by,
            
            // Scaffold safety checklist
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
            AntiSlipFootwear,
            SafetyNet,
            AnchorPointLifelines,
            SelfRetractingLifeline,
            FullBodyHarness,
            
            // NEW FIELDS - Additional columns from database
            FileName,
            FileSize,
            FileType,
            UploadDate,
            FileData,
            REASON,
            ADDITIONAL_PPE,
            
            // Issuer fields
            Issuer_Name,
            Issuer_Designation,
            Issuer_DateTime,
            Issuer_UpdatedBy,
            
            // Receiver fields
            Receiver_Name,
            Receiver_Designation,
            Receiver_DateTime,
            Receiver_UpdatedBy,
            
            // Energy Isolate fields
            EnergyIsolate_Name,
            EnergyIsolate_Designation,
            EnergyIsolate_DateTime,
            EnergyIsolate_UpdatedBy,
            
            // Reviewer fields
            Reviewer_Name,
            Reviewer_Designation,
            Reviewer_DateTime,
            Reviewer_UpdatedBy,
            
            // Approver fields  
            Approver_Name,
            Approver_Designation,
            Approver_DateTime,
            Approver_UpdatedBy
        } = req.body;

        // Handle uploaded files
        const uploadedFiles = req.files || [];
        const filesData = uploadedFiles.map(file => ({
            originalName: file.originalname,
            size: file.size,
            mimetype: file.mimetype
        }));

        const pool = await poolPromise;

        // Insert permit data
        const result = await pool.request()
            .input('PermitDate', sql.DateTime, PermitDate)
            .input('NearestFireAlarmPoint', sql.NVarChar(255), NearestFireAlarmPoint)
            .input('PermitNumber', sql.NVarChar(100), PermitNumber)
            .input('TotalEngagedWorkers', sql.Int, TotalEngagedWorkers)
            .input('WorkLocation', sql.NVarChar(255), WorkLocation)
            .input('WorkDescription', sql.NVarChar(sql.MAX), WorkDescription)
            .input('PermitValidUpTo', sql.DateTime, PermitValidUpTo)
            .input('Organization', sql.NVarChar(255), Organization)
            .input('SupervisorName', sql.NVarChar(255), SupervisorName)
            .input('ContactNumber', sql.NVarChar(50), ContactNumber)
            
            // Audit fields
            .input('Created_by', sql.NVarChar(100), Created_by || 'System')
            .input('Created_on', sql.DateTime, new Date())
            .input('Updated_by', sql.NVarChar(100), Updated_by || 'System')
            .input('Updated_on', sql.DateTime, new Date())
            .input('Documents', sql.NVarChar(sql.MAX), JSON.stringify(filesData))
            
            // Scaffold safety checklist
            .input('ScaffoldChecked', sql.Bit, ScaffoldChecked || false)
            .input('ScaffoldTagged', sql.Bit, ScaffoldTagged || false)
            .input('ScaffoldRechecked', sql.Bit, ScaffoldRechecked || false)
            .input('ScaffoldErected', sql.Bit, ScaffoldErected || false)
            .input('HangingBaskets', sql.Bit, HangingBaskets || false)
            .input('PlatformSafe', sql.Bit, PlatformSafe || false)
            .input('CatLadders', sql.Bit, CatLadders || false)
            .input('EdgeProtection', sql.Bit, EdgeProtection || false)
            .input('Platforms', sql.Bit, Platforms || false)
            .input('SafetyHarness', sql.Bit, SafetyHarness || false)
            
            // General safety precautions
            .input('EnergyPrecautions', sql.Bit, EnergyPrecautions || false)
            .input('Illumination', sql.Bit, Illumination || false)
            .input('UnguardedAreas', sql.Bit, UnguardedAreas || false)
            .input('FallProtection', sql.Bit, FallProtection || false)
            .input('AccessMeans', sql.Bit, AccessMeans || false)
            
            // PPE requirements
            .input('SafetyHelmet', sql.Bit, SafetyHelmet || false)
            .input('SafetyJacket', sql.Bit, SafetyJacket || false)
            .input('SafetyShoes', sql.Bit, SafetyShoes || false)
            .input('Gloves', sql.Bit, Gloves || false)
            .input('SafetyGoggles', sql.Bit, SafetyGoggles || false)
            .input('FaceShield', sql.Bit, FaceShield || false)
            .input('DustMask', sql.Bit, DustMask || false)
            .input('EarPlugEarmuff', sql.Bit, EarPlugEarmuff || false)
            .input('AntiSlipFootwear', sql.Bit, AntiSlipFootwear || false)
            .input('SafetyNet', sql.Bit, SafetyNet || false)
            .input('AnchorPointLifelines', sql.Bit, AnchorPointLifelines || false)
            .input('SelfRetractingLifeline', sql.Bit, SelfRetractingLifeline || false)
            .input('FullBodyHarness', sql.Bit, FullBodyHarness || false)
            
            // NEW FIELDS - Additional database columns
            .input('FileName', sql.NVarChar(255), FileName)
            .input('FileSize', sql.BigInt, FileSize)
            .input('FileType', sql.NVarChar(100), FileType)
            .input('UploadDate', sql.DateTime, UploadDate || new Date())
            .input('FileData', sql.VarBinary(sql.MAX), FileData)
            .input('REASON', sql.NVarChar(100), REASON)
            .input('ADDITIONAL_PPE', sql.NVarChar(500), ADDITIONAL_PPE)
            
            // Issuer fields
            .input('Issuer_Name', sql.NVarChar(100), Issuer_Name)
            .input('Issuer_Designation', sql.NVarChar(100), Issuer_Designation)
            .input('Issuer_DateTime', sql.DateTime, Issuer_DateTime)
            .input('Issuer_UpdatedBy', sql.NVarChar(100), Issuer_UpdatedBy)
            
            // Receiver fields
            .input('Receiver_Name', sql.NVarChar(100), Receiver_Name)
            .input('Receiver_Designation', sql.NVarChar(100), Receiver_Designation)
            .input('Receiver_DateTime', sql.DateTime, Receiver_DateTime)
            .input('Receiver_UpdatedBy', sql.NVarChar(100), Receiver_UpdatedBy)
            
            // Energy Isolate fields
            .input('EnergyIsolate_Name', sql.NVarChar(100), EnergyIsolate_Name)
            .input('EnergyIsolate_Designation', sql.NVarChar(100), EnergyIsolate_Designation)
            .input('EnergyIsolate_DateTime', sql.DateTime, EnergyIsolate_DateTime)
            .input('EnergyIsolate_UpdatedBy', sql.NVarChar(100), EnergyIsolate_UpdatedBy)
            
            // Reviewer fields
            .input('Reviewer_Name', sql.NVarChar(100), Reviewer_Name)
            .input('Reviewer_Designation', sql.NVarChar(100), Reviewer_Designation)
            .input('Reviewer_DateTime', sql.DateTime, Reviewer_DateTime)
            .input('Reviewer_UpdatedBy', sql.NVarChar(100), Reviewer_UpdatedBy)
            
            // Approver fields
            .input('Approver_Name', sql.NVarChar(100), Approver_Name)
            .input('Approver_Designation', sql.NVarChar(100), Approver_Designation)
            .input('Approver_DateTime', sql.DateTime, Approver_DateTime)
            .input('Approver_UpdatedBy', sql.NVarChar(100), Approver_UpdatedBy)
            .query(`
                INSERT INTO WORK_PERMIT (
                    PermitDate, NearestFireAlarmPoint, PermitNumber, TotalEngagedWorkers, 
                    WorkLocation, WorkDescription, PermitValidUpTo, Organization, 
                    SupervisorName, ContactNumber, Created_by, Created_on, Updated_by, 
                    Updated_on, Documents, ScaffoldChecked, ScaffoldTagged, ScaffoldRechecked, 
                    ScaffoldErected, HangingBaskets, PlatformSafe, CatLadders, EdgeProtection, 
                    Platforms, SafetyHarness, EnergyPrecautions, Illumination, UnguardedAreas, 
                    FallProtection, AccessMeans, SafetyHelmet, SafetyJacket, SafetyShoes, 
                    Gloves, SafetyGoggles, FaceShield, DustMask, EarPlugEarmuff, 
                    AntiSlipFootwear, SafetyNet, AnchorPointLifelines, SelfRetractingLifeline, 
                    FullBodyHarness, FileName, FileSize, FileType, UploadDate, FileData,
                    REASON, ADDITIONAL_PPE, Issuer_Name, Issuer_Designation, Issuer_DateTime, 
                    Issuer_UpdatedBy, Receiver_Name, Receiver_Designation, Receiver_DateTime, 
                    Receiver_UpdatedBy, EnergyIsolate_Name, EnergyIsolate_Designation, 
                    EnergyIsolate_DateTime, EnergyIsolate_UpdatedBy, Reviewer_Name, 
                    Reviewer_Designation, Reviewer_DateTime, Reviewer_UpdatedBy, 
                    Approver_Name, Approver_Designation, Approver_DateTime, Approver_UpdatedBy
                )
                OUTPUT INSERTED.PermitID
                VALUES (
                    @PermitDate, @NearestFireAlarmPoint, @PermitNumber, @TotalEngagedWorkers, 
                    @WorkLocation, @WorkDescription, @PermitValidUpTo, @Organization, 
                    @SupervisorName, @ContactNumber, @Created_by, @Created_on, @Updated_by, 
                    @Updated_on, @Documents, @ScaffoldChecked, @ScaffoldTagged, @ScaffoldRechecked, 
                    @ScaffoldErected, @HangingBaskets, @PlatformSafe, @CatLadders, @EdgeProtection, 
                    @Platforms, @SafetyHarness, @EnergyPrecautions, @Illumination, @UnguardedAreas, 
                    @FallProtection, @AccessMeans, @SafetyHelmet, @SafetyJacket, @SafetyShoes, 
                    @Gloves, @SafetyGoggles, @FaceShield, @DustMask, @EarPlugEarmuff, 
                    @AntiSlipFootwear, @SafetyNet, @AnchorPointLifelines, @SelfRetractingLifeline, 
                    @FullBodyHarness, @FileName, @FileSize, @FileType, @UploadDate, @FileData,
                    @REASON, @ADDITIONAL_PPE, @Issuer_Name, @Issuer_Designation, @Issuer_DateTime, 
                    @Issuer_UpdatedBy, @Receiver_Name, @Receiver_Designation, @Receiver_DateTime, 
                    @Receiver_UpdatedBy, @EnergyIsolate_Name, @EnergyIsolate_Designation, 
                    @EnergyIsolate_DateTime, @EnergyIsolate_UpdatedBy, @Reviewer_Name, 
                    @Reviewer_Designation, @Reviewer_DateTime, @Reviewer_UpdatedBy, 
                    @Approver_Name, @Approver_Designation, @Approver_DateTime, @Approver_UpdatedBy
                )
            `);

        const permitId = result.recordset[0].PermitID;

        // Insert file records if any files were uploaded
        if (uploadedFiles.length > 0) {
            for (const file of uploadedFiles) {
                await pool.request()
                    .input('PermitID', sql.Int, permitId)
                    .input('FileName', sql.NVarChar(255), file.originalname)
                    .input('FileSize', sql.BigInt, file.size)
                    .input('FileType', sql.NVarChar(100), file.mimetype)
                    .input('FileData', sql.VarBinary(sql.MAX), file.buffer)
                    .input('UploadedAt', sql.DateTime, new Date())
                    .query(`
                        INSERT INTO PERMIT_FILES (PermitID, FileName, FileSize, FileType, FileData, UploadedAt)
                        VALUES (@PermitID, @FileName, @FileSize, @FileType, @FileData, @UploadedAt)
                    `);
            }
        }

        res.status(201).json({ 
            message: 'Permit saved successfully',
            permitId: permitId,
            uploadedFiles: filesData.length
        });
    } catch (error) {
        console.error('Error saving permit:', error);
        
        // Clean up uploaded files if database operation failed
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }
        
        res.status(500).json({ error: 'Failed to save permit: ' + error.message });
    }
};

// Get all permits
const getPermits = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT p.*, 
                   (SELECT COUNT(*) FROM PERMIT_FILES f WHERE f.PermitID = p.PermitID) as FileCount
            FROM WORK_PERMIT p 
            ORDER BY p.Created_on DESC
        `);
        
        // For each permit, get its files
        for (let permit of result.recordset) {
            const filesResult = await pool.request()
                .input('PermitID', sql.Int, permit.PermitID)
                .query('SELECT FileID, FileName, FileSize, FileType, UploadedAt FROM PERMIT_FILES WHERE PermitID = @PermitID ORDER BY UploadedAt DESC');
            
            permit.Files = filesResult.recordset;
        }
        
        res.json(result.recordset);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch permits' });
    }
};

const getPermitById = async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await poolPromise;
        
        // Get permit details
        const permitResult = await pool.request()
            .input('PermitID', sql.Int, id)
            .query('SELECT * FROM WORK_PERMIT WHERE PermitID = @PermitID');
        
        if (permitResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Permit not found' });
        }
        
        // Get associated files
        const filesResult = await pool.request()
            .input('PermitID', sql.Int, id)
            .query('SELECT FileID, FileName, FileSize, FileType, UploadedAt FROM PERMIT_FILES WHERE PermitID = @PermitID ORDER BY UploadedAt DESC');
        
        const permit = permitResult.recordset[0];
        permit.files = filesResult.recordset;
        
        res.json(permit);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch permit' });
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
const updatePermit = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            PermitDate, NearestFireAlarmPoint, PermitNumber, TotalEngagedWorkers,
            WorkLocation, WorkDescription, PermitValidUpTo, Organization,
            SupervisorName, ContactNumber, Updated_by,
            ScaffoldChecked, ScaffoldTagged, ScaffoldRechecked, ScaffoldErected,
            HangingBaskets, PlatformSafe, CatLadders, EdgeProtection, Platforms,
            SafetyHarness, EnergyPrecautions, Illumination, UnguardedAreas,
            FallProtection, AccessMeans, SafetyHelmet, SafetyJacket, SafetyShoes,
            Gloves, SafetyGoggles, FaceShield, DustMask, EarPlugEarmuff,
            AntiSlipFootwear, SafetyNet, AnchorPointLifelines, SelfRetractingLifeline,
            FullBodyHarness,
            
            // NEW FIELDS for update
            FileName, FileSize, FileType, UploadDate, FileData,
            REASON, ADDITIONAL_PPE,
            Issuer_Name, Issuer_Designation, Issuer_DateTime, Issuer_UpdatedBy,
            Receiver_Name, Receiver_Designation, Receiver_DateTime, Receiver_UpdatedBy,
            EnergyIsolate_Name, EnergyIsolate_Designation, EnergyIsolate_DateTime, EnergyIsolate_UpdatedBy,
            Reviewer_Name, Reviewer_Designation, Reviewer_DateTime, Reviewer_UpdatedBy,
            Approver_Name, Approver_Designation, Approver_DateTime, Approver_UpdatedBy
        } = req.body;
        console.log('DEBUG req.body for update:', req.body);
        const pool = await poolPromise;
        
        // Handle new uploaded files
        const uploadedFiles = req.files || [];
        const filesData = uploadedFiles.map(file => ({
            originalName: file.originalname,
            size: file.size,
            mimetype: file.mimetype
        }));
        
        await pool.request()
            .input('PermitID', sql.Int, id)
            .input('PermitDate', sql.DateTime, PermitDate)
            .input('NearestFireAlarmPoint', sql.NVarChar(255), NearestFireAlarmPoint)
            .input('PermitNumber', sql.NVarChar(100), PermitNumber)
            .input('TotalEngagedWorkers', sql.Int, TotalEngagedWorkers)
            .input('WorkLocation', sql.NVarChar(255), WorkLocation)
            .input('WorkDescription', sql.NVarChar(sql.MAX), WorkDescription)
            .input('PermitValidUpTo', sql.DateTime, PermitValidUpTo)
            .input('Organization', sql.NVarChar(255), Organization)
            .input('SupervisorName', sql.NVarChar(255), SupervisorName)
            .input('ContactNumber', sql.NVarChar(50), ContactNumber)
            .input('Updated_by', sql.NVarChar(100), Updated_by)
            .input('Updated_on', sql.DateTime, new Date())
            
            // Scaffold safety checklist
            .input('ScaffoldChecked', sql.Bit, ScaffoldChecked === 'true' ? 1 : 0)
            .input('ScaffoldTagged', sql.Bit, ScaffoldTagged === 'true' ? 1 : 0)
            .input('ScaffoldRechecked', sql.Bit, ScaffoldRechecked === 'true' ? 1 : 0)
            .input('ScaffoldErected', sql.Bit, ScaffoldErected === 'true' ? 1 : 0)
            .input('HangingBaskets', sql.Bit, HangingBaskets === 'true' ? 1 : 0)
            .input('PlatformSafe', sql.Bit, PlatformSafe === 'true' ? 1 : 0)
            .input('CatLadders', sql.Bit, CatLadders === 'true' ? 1 : 0)
            .input('EdgeProtection', sql.Bit, EdgeProtection === 'true' ? 1 : 0)
            .input('Platforms', sql.Bit, Platforms === 'true' ? 1 : 0)
            .input('SafetyHarness', sql.Bit, SafetyHarness === 'true' ? 1 : 0)

            // General safety precautions
            .input('EnergyPrecautions', sql.Bit, EnergyPrecautions === 'true' ? 1 : 0)
            .input('Illumination', sql.Bit, Illumination === 'true' ? 1 : 0)
            .input('UnguardedAreas', sql.Bit, UnguardedAreas === 'true' ? 1 : 0)
            .input('FallProtection', sql.Bit, FallProtection === 'true' ? 1 : 0)
            .input('AccessMeans', sql.Bit, AccessMeans === 'true' ? 1 : 0)

            // PPE requirements
            .input('SafetyHelmet', sql.Bit, SafetyHelmet === 'true')
            .input('SafetyJacket', sql.Bit, SafetyJacket === 'true')
            .input('SafetyShoes', sql.Bit, SafetyShoes === 'true')
            .input('Gloves', sql.Bit, Gloves === 'true')
            .input('SafetyGoggles', sql.Bit, SafetyGoggles === 'true')
            .input('FaceShield', sql.Bit, FaceShield === 'true')
            .input('DustMask', sql.Bit, DustMask === 'true')
            .input('EarPlugEarmuff', sql.Bit, EarPlugEarmuff === 'true')
            .input('AntiSlipFootwear', sql.Bit, AntiSlipFootwear === 'true')
            .input('SafetyNet', sql.Bit, SafetyNet === 'true')
            .input('AnchorPointLifelines', sql.Bit, AnchorPointLifelines === 'true')
            .input('SelfRetractingLifeline', sql.Bit, SelfRetractingLifeline === 'true')
            .input('FullBodyHarness', sql.Bit, FullBodyHarness === 'true')

            
            // NEW FIELDS for update
            .input('FileName', sql.NVarChar(255), FileName)
            .input('FileSize', sql.BigInt, FileSize)
            .input('FileType', sql.NVarChar(100), FileType)
            .input('UploadDate', sql.DateTime, UploadDate)
            .input('FileData', sql.VarBinary(sql.MAX), FileData)
            .input('REASON', sql.NVarChar(100), REASON)
            .input('ADDITIONAL_PPE', sql.NVarChar(500), ADDITIONAL_PPE)
            
            // Issuer fields
            .input('Issuer_Name', sql.NVarChar(100), Issuer_Name)
            .input('Issuer_Designation', sql.NVarChar(100), Issuer_Designation)
            .input('Issuer_DateTime', sql.DateTime, Issuer_DateTime)
            .input('Issuer_UpdatedBy', sql.NVarChar(100), Issuer_UpdatedBy)
            
            // Receiver fields
            .input('Receiver_Name', sql.NVarChar(100), Receiver_Name)
            .input('Receiver_Designation', sql.NVarChar(100), Receiver_Designation)
            .input('Receiver_DateTime', sql.DateTime, Receiver_DateTime)
            .input('Receiver_UpdatedBy', sql.NVarChar(100), Receiver_UpdatedBy)
            
            // Energy Isolate fields
            .input('EnergyIsolate_Name', sql.NVarChar(100), EnergyIsolate_Name)
            .input('EnergyIsolate_Designation', sql.NVarChar(100), EnergyIsolate_Designation)
            .input('EnergyIsolate_DateTime', sql.DateTime, EnergyIsolate_DateTime)
            .input('EnergyIsolate_UpdatedBy', sql.NVarChar(100), EnergyIsolate_UpdatedBy)
            
            // Reviewer fields
            .input('Reviewer_Name', sql.NVarChar(100), Reviewer_Name)
            .input('Reviewer_Designation', sql.NVarChar(100), Reviewer_Designation)
            .input('Reviewer_DateTime', sql.DateTime, Reviewer_DateTime)
            .input('Reviewer_UpdatedBy', sql.NVarChar(100), Reviewer_UpdatedBy)
            
            // Approver fields
            .input('Approver_Name', sql.NVarChar(100), Approver_Name)
            .input('Approver_Designation', sql.NVarChar(100), Approver_Designation)
            .input('Approver_DateTime', sql.DateTime, Approver_DateTime)
            .input('Approver_UpdatedBy', sql.NVarChar(100), Approver_UpdatedBy)
            .query(`
                UPDATE WORK_PERMIT SET 
                    PermitDate = @PermitDate,
                    NearestFireAlarmPoint = @NearestFireAlarmPoint,
                    PermitNumber = @PermitNumber,
                    TotalEngagedWorkers = @TotalEngagedWorkers,
                    WorkLocation = @WorkLocation,
                    WorkDescription = @WorkDescription,
                    PermitValidUpTo = @PermitValidUpTo,
                    Organization = @Organization,
                    SupervisorName = @SupervisorName,
                    ContactNumber = @ContactNumber,
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
                    AntiSlipFootwear = @AntiSlipFootwear,
                    SafetyNet = @SafetyNet,
                    AnchorPointLifelines = @AnchorPointLifelines,
                    SelfRetractingLifeline = @SelfRetractingLifeline,
                    FullBodyHarness = @FullBodyHarness,
                    FileName = @FileName,
                    FileSize = @FileSize,
                    FileType = @FileType,
                    UploadDate = @UploadDate,
                    FileData = @FileData,
                    REASON = @REASON,
                    ADDITIONAL_PPE = @ADDITIONAL_PPE,
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
                    Approver_UpdatedBy = @Approver_UpdatedBy
                WHERE PermitID = @PermitID
            `);

        // Add new files if any
        if (uploadedFiles.length > 0) {
            for (const file of uploadedFiles) {
                await pool.request()
                    .input('PermitID', sql.Int, id)
                    .input('FileName', sql.NVarChar(255), file.originalname)
                    .input('FileSize', sql.BigInt, file.size)
                    .input('FileType', sql.NVarChar(100), file.mimetype)
                    .input('FileData', sql.VarBinary(sql.MAX), file.buffer)
                    .input('UploadedAt', sql.DateTime, new Date())
                    .query(`
                        INSERT INTO PERMIT_FILES (PermitID, FileName, FileSize, FileType, FileData, UploadedAt)
                        VALUES (@PermitID, @FileName, @FileSize, @FileType, @FileData, @UploadedAt)
                    `);
            }
        }

        res.json({ 
            message: 'Permit updated successfully',
            newFilesUploaded: uploadedFiles.length
        });
    } catch (error) {
        console.error(error);
        
        // Clean up uploaded files if database operation failed
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }
        
        res.status(500).json({ error: 'Failed to update permit' });
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
        const { reason } = req.body;
        const pool = await poolPromise;
        
        // Update only the REASON field, not adding any Status column
        const updateResult = await pool.request()
            .input('PermitID', sql.Int, id)
            .input('Reason', sql.NVarChar, reason)
            .query('UPDATE WORK_PERMIT SET REASON = @Reason WHERE PermitID = @PermitID');
        
        if (updateResult.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Permit not found' });
        }
        
        // Get permit details for the email
        const permitResult = await pool.request()
            .input('PermitID', sql.Int, id)
            .query('SELECT PermitNumber, WorkLocation, WorkDescription, REASON FROM WORK_PERMIT WHERE PermitID = @PermitID');
        
        if (permitResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Permit details not found' });
        }
        
        const permit = permitResult.recordset[0];
        
        // Send email notification
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: 'Mukund.Kumar@hindterminals.com,amit.singh@elogisol.in,dinesh.gautam@elogisol.in,info@elogisol.in,avinashtiwari5322@gmail.com',
            subject: `Work Permit ${permit.PermitNumber} Put On Hold`,
            html: `
                <h2>Work Permit Has Been Put On Hold</h2>
                <p><strong>Permit Number:</strong> ${permit.PermitNumber}</p>
                <p><strong>Location:</strong> ${permit.WorkLocation}</p>
                <p><strong>Work Description:</strong> ${permit.WorkDescription}</p>
                <p><strong>Reason for Hold:</strong> ${permit.REASON}</p>
                <p>Please review the permit details in the system.</p>
            `
        };
        
        await transporter.sendMail(mailOptions);
        
        res.json({ 
            message: 'Your has been put on hold and notification emails have been sent',
            permitId: id
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to put permit on hold: ' + error.message });
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
    getFileById, // NEW function
    deleteFile,
    holdPermit // Add the new function to exports
};