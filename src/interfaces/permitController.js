const multer = require('multer'); 

const path = require('path');
const fs = require('fs');
const { poolPromise, sql } = require('../config/db');

// Create uploads directory if it doesn't exist
const uploadsDir = 'uploads/permits';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + extension);
    }
});

// File filter to allow only specific file types
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images, PDF, DOC, DOCX, and TXT files are allowed.'), false);
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
            FullBodyHarness
        } = req.body;

        // Handle uploaded files
        const uploadedFiles = req.files || [];
        const filesData = uploadedFiles.map(file => ({
            originalName: file.originalname,
            filename: file.filename,
            path: file.path,
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
                    FullBodyHarness
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
                    @FullBodyHarness
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
                    .input('FilePath', sql.NVarChar(500), file.path)
                    .input('UploadedAt', sql.DateTime, new Date())
                    .query(`
                        INSERT INTO PERMIT_FILES (PermitID, FileName, FileSize, FileType, FilePath, UploadedAt)
                        VALUES (@PermitID, @FileName, @FileSize, @FileType, @FilePath, @UploadedAt)
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
            .query('SELECT * FROM PERMIT_FILES WHERE PermitID = @PermitID ORDER BY UploadedAt DESC');
        
        const permit = permitResult.recordset[0];
        permit.files = filesResult.recordset;
        
        res.json(permit);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch permit' });
    }
};

// Serve uploaded files
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
            FullBodyHarness
        } = req.body;

        const pool = await poolPromise;
        
        // Handle new uploaded files
        const uploadedFiles = req.files || [];
        const filesData = uploadedFiles.map(file => ({
            originalName: file.originalname,
            filename: file.filename,
            path: file.path,
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
                    FullBodyHarness = @FullBodyHarness
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
                    .input('FilePath', sql.NVarChar(500), file.path)
                    .input('UploadedAt', sql.DateTime, new Date())
                    .query(`
                        INSERT INTO PERMIT_FILES (PermitID, FileName, FileSize, FileType, FilePath, UploadedAt)
                        VALUES (@PermitID, @FileName, @FileSize, @FileType, @FilePath, @UploadedAt)
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
        
        // Get associated files before deletion
        const filesResult = await pool.request()
            .input('PermitID', sql.Int, id)
            .query('SELECT FilePath FROM PERMIT_FILES WHERE PermitID = @PermitID');
        
        // Delete permit (cascade will delete associated files from database)
        const result = await pool.request()
            .input('PermitID', sql.Int, id)
            .query('DELETE FROM WORK_PERMIT WHERE PermitID = @PermitID');
        
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Permit not found' });
        }
        
        // Delete physical files
        filesResult.recordset.forEach(file => {
            if (fs.existsSync(file.FilePath)) {
                fs.unlinkSync(file.FilePath);
            }
        });
        
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
        
        // Get file info before deletion
        const fileResult = await pool.request()
            .input('FileID', sql.Int, fileId)
            .query('SELECT FilePath FROM PERMIT_FILES WHERE FileID = @FileID');
        
        if (fileResult.recordset.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const filePath = fileResult.recordset[0].FilePath;
        
        // Delete from database
        await pool.request()
            .input('FileID', sql.Int, fileId)
            .query('DELETE FROM PERMIT_FILES WHERE FileID = @FileID');
        
        // Delete physical file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete file' });
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
    deleteFile
};