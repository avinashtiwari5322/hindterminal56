const express = require('express'); 
const multer = require('multer'); 
const getLastPermitNumber = require("./getLastPermitNumber");
const { login } = require('../interfaces/loginController');
const router = express.Router();
const { 
    upload,
    getPermitsByUser,
    savePermit,
    getPermits,
    getPermitById,
    updatePermit,
    deletePermit,
    getFile,
    getFileById,
    getAdminDocumentByPermitId,
    deleteFile,
    holdPermit, // Add the new function
    uploadAdminDocument,
    approvePermit,
    closePermit
} = require('./permitController');
// API endpoint to approve a permit (set CurrentPermitStatus to Approved)
router.post('/permits/approve', approvePermit);

// API endpoint to close a permit (set CurrentPermitStatus to Close)
router.post('/permits/close', closePermit);
// API endpoint to get admin document metadata for a permit
router.get('/permits/:permitId/admin-document', getAdminDocumentByPermitId);
// API endpoint to upload admin document for a permit
router.post('/permits/admin-document', upload.single('file'), uploadAdminDocument);

// Combined route for permits
router.get('/permits', async (req, res) => {
    const { UserId } = req.query;
    if (UserId) {
        // Call getPermitsByUser logic if UserId is provided
        await getPermitsByUser(req, res);
    } else {
        // Call getPermits logic if no UserId
        await getPermits(req, res);
    }
});
router.post('/login', login);
// Routes for permits with file upload support
router.post('/permits', upload.array('files', 10), savePermit);
router.post('/permits/draft', upload.array('files', 10), savePermit);
// router.get('/permits', getPermits);
// router.get('/permits', getPermitsByUser);
router.get('/permits/:id', getPermitById);
router.put('/permits/:id', upload.array('files', 10), updatePermit);
router.delete('/permits/:id', deletePermit);
router.get("/last-permit-number", getLastPermitNumber);

// Routes for file operations
router.get('/files/:filename', getFile); // Keep for backward compatibility
router.get('/permits/file/:fileId', getFileById); // NEW route for database files
router.delete('/files/:fileId', deleteFile);

// Error handling middleware for multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large. Maximum size is 4MB per file.'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: 'Too many files. Maximum 10 files allowed.'
            });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                error: 'Unexpected field name for file upload.'
            });
        }
    }
    
    if (error.message.includes('Invalid file type')) {
        return res.status(400).json({
            error: error.message
        });
    }
    
    next(error);
});

// Route for putting a permit on hold
router.post('/permits/:id/hold', holdPermit);

module.exports = router;