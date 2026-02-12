const express = require('express'); 
const multer = require('multer'); 
const getLastPermitNumber = require("./getLastPermitNumber");
const { login } = require('../interfaces/loginController');
const router = express.Router();
const {
    getUserMasterData,
    addUserMaster,
    updateUserMaster,
    deleteUserMaster,
    getLocationMasterData, 
    addLocationMaster,
    updateLocationMaster,
    deleteLocationMaster,
    getCompanyMasterData,
    addCompanyMaster,
    updateCompanyMaster,
    deleteCompanyMaster,
    getRoleMasterData,
    changePassword,
    resetUserPassword,
    getLocationMaster,
    addDepartment,
    updateDepartment,
    deleteDepartment,
    getDepartments,

    addAlarmPoint,
    updateAlarmPoint,
    deleteAlarmPoint,
    getAlarmPoints,

    addWorkLocation,
    updateWorkLocation,
    deleteWorkLocation,
    getWorkLocations,
    addDesignation,
    updateDesignation,
    deleteDesignation,
    getDesignations,
    sendOtp,
    verifyOtp
} = require('../interfaces/masterController.js');
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
    getCloseDocumentByPermitId,
    deleteFile,
    holdPermit,
    rejectPermit,
    uploadAdminDocument,
    approvePermit,
    closePermit,
    getPermitTypes,
    reopenPermit
} = require('./permitController.js');
// API endpoint to approve a permit (set CurrentPermitStatus to Approved)
router.post('/permits/approve', approvePermit);

// Updated route to accept document(s) for closing a permit (field name: 'files')
router.post('/permits/close', upload.array('files', 10), closePermit);
// API endpoint to get admin document metadata for a permit
router.get('/permits/:permitId/admin-document', getAdminDocumentByPermitId);
// API endpoint to upload admin document for a permit
router.post('/permits/admin-document', upload.single('file'), uploadAdminDocument);

// API endpoint to get close document metadata for a permit
router.get('/permits/:permitId/close-document', getCloseDocumentByPermitId);

// Combined route for fetching permits via POST (accepts JSON body with optional UserId)
// Unified fetch route: POST /permits accepts optional body { UserId, Location, page, pageSize }
router.post('/permit-list', async (req, res) => {
    await getPermits(req, res);
});
router.post('/login', login);
// Routes for permits with file upload support
// Create permit endpoint — renamed to avoid collision with POST /permits fetch route
router.post('/permits', upload.array('files', 10), savePermit);
router.post('/permits/draft', upload.array('files', 10), savePermit);
// router.get('/permits', getPermits);
// router.get('/permits', getPermitsByUser);
router.get('/permits/:id', getPermitById);
router.put('/permits/:id', upload.array('files', 10), updatePermit);
router.delete('/permits/:id', deletePermit);
router.get("/last-permit-number", getLastPermitNumber);



// Route to reject a permit
router.post('/permits/:id/reject', rejectPermit);



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

// API endpoint to fetch permit types
router.get('/permit-types', getPermitTypes);

// API endpoint to reopen an expired permit
router.post('/permits/reopen', reopenPermit);
/* ================= USER MASTER ================= */
router.post('/user-master', getUserMasterData);
router.post('/user/add', addUserMaster);
router.post('/user/update', updateUserMaster);
router.post('/user/delete', deleteUserMaster);

/* ================= LOCATION MASTER ================= */
router.get('/location-master', getLocationMaster);
router.post('/location/add', addLocationMaster);
router.post('/location/update', updateLocationMaster);
router.post('/location/delete', deleteLocationMaster);

/* ================= COMPANY MASTER ================= */
router.post('/company-master', getCompanyMasterData);
router.post('/company/add', addCompanyMaster);
router.post('/company/update', updateCompanyMaster);
router.post('/company/delete', deleteCompanyMaster);

/* ================= ROLE MASTER ================= */
router.post('/role-master', getRoleMasterData);
router.post('/user/change-password', changePassword);
router.post('/user/reset-password', resetUserPassword);

/* Department */
router.post("/department/add", addDepartment);
router.post("/department/update", updateDepartment);
router.post("/department/delete", deleteDepartment);
router.post("/department/list", getDepartments);

/* Alarm Point */
router.post("/alarm-point/add", addAlarmPoint);
router.post("/alarm-point/update", updateAlarmPoint);
router.post("/alarm-point/delete", deleteAlarmPoint);
router.post("/alarm-point/list", getAlarmPoints);

/* Work Location */
router.post("/work-location/add", addWorkLocation);
router.post("/work-location/update", updateWorkLocation);
router.post("/work-location/delete", deleteWorkLocation);
router.post("/work-location/list", getWorkLocations);
/* Designation */
router.post("/designation/add", addDesignation);
router.post("/designation/update", updateDesignation);
router.post("/designation/delete", deleteDesignation);
router.post("/designation/list", getDesignations);

/* ================= OTP AUTHENTICATION ================= */
// Route to send OTP
router.post('/send-otp', sendOtp);

// Route to verify OTP
router.post('/verify-otp', verifyOtp);


module.exports = router;