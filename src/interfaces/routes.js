const express = require('express');
const multer = require('multer'); 
const router = express.Router();
const { 
    upload, 
    savePermit, 
    getPermits, 
    getPermitById, 
    updatePermit,
    deletePermit,
    getFile,
    deleteFile
} = require('./permitController');

// Routes for permits with file upload support
router.post('/permits', upload.array('files', 10), savePermit);
router.post('/permits/draft', upload.array('files', 10), savePermit);
router.get('/permits', getPermits);
router.get('/permits/:id', getPermitById);
router.put('/permits/:id', upload.array('files', 10), updatePermit);
router.delete('/permits/:id', deletePermit);

// Routes for file operations
router.get('/files/:filename', getFile);
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

module.exports = router;