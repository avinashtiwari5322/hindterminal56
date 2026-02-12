const { poolPromise, sql } = require("../config/db");
const transporter = require("../config/mailer");
const bcrypt = require('bcryptjs');
const crypto = require("crypto");


/* Random Password Generator */
const generateRandomPassword = (length = 4) => {
    const chars = '123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

/* Password Hashing Function (Reusable Anywhere) */
const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};
const comparePassword = async (plain, hash) => {
    return bcrypt.compare(plain, hash);
};

/* Email Sender */
const sendPasswordEmail = async (email, username, password, locationName) => {
    const url = process.env.UI_URL || 'http://localhost:3000';
    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Login Credentials',
        html: `
            <p>Your account has been created for the ${locationName} location.</p>
            <p>Username - ${username}</p>
            <p><b>Password:</b> ${password}</p>
            <p>Please change your password after login.</p>
            <p><a href="${url}">Login Here</a></p>
        `
    });
};


/* =========================================================
   COMMON VALIDATION : SUPER USER + COMPANY MAPPING
========================================================= */
const validateSuperUser = async (pool, CompanyId, UserId) => {
    const result = await pool.request()
        .input('CompanyId', sql.Int, CompanyId)
        .input('UserId', sql.Int, UserId)
        .query(`
            SELECT 1
            FROM UserMaster u
            INNER JOIN UserCompanyMaster cum 
                ON u.UserId = cum.UserId
            INNER JOIN RoleMaster r 
                ON u.RoleId = r.RoleId
            WHERE u.UserId = @UserId
              AND cum.CompanyId = @CompanyId
              AND r.RoleName = 'superuser'
              AND u.IsActive = 1 AND u.DelMark = 0
        `);

    return result.recordset.length > 0;
};

/* =========================================================
   ROLE MASTER (NO PAGINATION)
========================================================= */
const getRoleMasterData = async (req, res) => {
    try {
        const { CompanyId, UserId } = req.body;

        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }

        const pool = await poolPromise;

        /* ---- Fetch Roles ---- */
        const result = await pool.request().query(`
            SELECT 
                RoleId,
                RoleName
            FROM RoleMaster
            ORDER BY RoleName
        `);

        res.json({
            success: true,
            data: result.recordset
        });

    } catch (error) {
        console.error('Role Master Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};



/* =========================================================
   USER MASTER (PAGINATED)
========================================================= */
const getUserMasterData = async (req, res) => {
    try {
        const { CompanyId, UserId, Page = 1, PageSize = 10 } = req.body;

        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }

        const page = Math.max(parseInt(Page), 1);
        const pageSize = Math.max(parseInt(PageSize), 1);
        const offset = (page - 1) * pageSize;

        const pool = await poolPromise;

        /* ---- Validate Super User ---- */
        const isValidUser = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValidUser) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: SuperUser access required'
            });
        }

        /* ---- Total Count ---- */
        const countResult = await pool.request()
            .input('CompanyId', sql.Int, CompanyId)
            .query(`
                SELECT COUNT(*) AS TotalCount
                FROM UserMaster u
                INNER JOIN UserCompanyMaster cum ON u.UserId = cum.UserId
                WHERE cum.CompanyId = @CompanyId
                  AND u.IsActive = 1 AND u.DelMark = 0
            `);

        /* ---- Paged Data ---- */
        const dataResult = await pool.request()
            .input('CompanyId', sql.Int, CompanyId)
            .input('Offset', sql.Int, offset)
            .input('PageSize', sql.Int, pageSize)
            .query(`
                SELECT 
                    u.UserId,
                    u.UserName,
                    u.Name,
                    u.MailId,
                    r.RoleName,
                    c.CompanyId,
                    c.CompanyName,
                    d.DesignationName,
                    d.DesignationId,
                    u.LocationId,
                    l.LocationName,
                    CONVERT(VARCHAR, u.CreatedOn, 127) AS CreatedOn
                FROM UserMaster u
                INNER JOIN RoleMaster r ON u.RoleId = r.RoleId
                INNER JOIN UserCompanyMaster cum ON u.UserId = cum.UserId
                INNER JOIN CompanyMaster c ON cum.CompanyId = c.CompanyId
                INNER JOIN LocationMaster l ON u.LocationId = l.LocationId
                LEFT JOIN DesignationMaster d ON u.DesignationId = d.DesignationId
                WHERE cum.CompanyId = @CompanyId
                  AND u.IsActive = 1 AND u.DelMark = 0
                  AND c.IsActive = 1 AND c.DelMark = 0
                ORDER BY u.UserId DESC
                OFFSET @Offset ROWS
                FETCH NEXT @PageSize ROWS ONLY
            `);

        res.json({
            success: true,
            page,
            pageSize,
            totalRecords: countResult.recordset[0].TotalCount,
            totalPages: Math.ceil(countResult.recordset[0].TotalCount / pageSize),
            data: dataResult.recordset
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/* =========================================================
   LOCATION MASTER (PAGINATED)
========================================================= */
const getLocationMaster = async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .query(`
                SELECT 
                    *
                FROM LocationMaster
                WHERE IsActive = 1 
                  AND DelMark = 0
                ORDER BY LocationName DESC
            `);

        return res.status(200).json({
            success: true,
            data: result.recordset
        });

    } catch (error) {
        console.error('Error in getLocationMaster:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch location master data'
        });
    }
};


const getLocationMasterData = async (req, res) => {
    try {
        const { CompanyId, UserId, Page = 1, PageSize = 10 } = req.body;

        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }

        const page = Math.max(parseInt(Page), 1);
        const pageSize = Math.max(parseInt(PageSize), 1);
        const offset = (page - 1) * pageSize;

        const pool = await poolPromise;

        const isValidUser = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValidUser) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: SuperUser access required'
            });
        }

        const countResult = await pool.request().query(`
            SELECT COUNT(*) AS TotalCount
            FROM LocationMaster
            WHERE IsActive = 1 AND DelMark = 0
        `);

        const dataResult = await pool.request()
            .input('Offset', sql.Int, offset)
            .input('PageSize', sql.Int, pageSize)
            .query(`
                SELECT *
                FROM LocationMaster
                WHERE IsActive = 1 AND DelMark = 0
                ORDER BY LocationId DESC
                OFFSET @Offset ROWS
                FETCH NEXT @PageSize ROWS ONLY
            `);

        res.json({
            success: true,
            page,
            pageSize,
            totalRecords: countResult.recordset[0].TotalCount,
            data: dataResult.recordset
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/* =========================================================
   COMPANY MASTER (PAGINATED)
========================================================= */
const getCompanyMasterData = async (req, res) => {
    try {
        const { CompanyId, UserId, Page = 1, PageSize = 10 } = req.body;

        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }

        const page = Math.max(parseInt(Page), 1);
        const pageSize = Math.max(parseInt(PageSize), 1);
        const offset = (page - 1) * pageSize;

        const pool = await poolPromise;

        const isValidUser = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValidUser) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: SuperUser access required'
            });
        }

        const countResult = await pool.request().query(`
            SELECT COUNT(*) AS TotalCount
            FROM CompanyMaster
            WHERE IsActive = 1 AND DelMark = 0
        `);

        const dataResult = await pool.request()
            .input('Offset', sql.Int, offset)
            .input('PageSize', sql.Int, pageSize)
            .query(`
                SELECT *
                FROM CompanyMaster
                WHERE IsActive = 1 AND DelMark = 0
                ORDER BY CompanyId DESC
                OFFSET @Offset ROWS
                FETCH NEXT @PageSize ROWS ONLY
            `);

        res.json({
            success: true,
            page,
            pageSize,
            totalRecords: countResult.recordset[0].TotalCount,
            data: dataResult.recordset
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/* =========================================================
   USER MASTER - ADD
========================================================= */
const addUserMaster = async (req, res) => {
    try {
        const { CompanyId, UserId, UserName, Name, MailId, RoleId, DesignationId, LocationId } = req.body;
        const userName = UserName.trim();
        const pool = await poolPromise;

        // Validate super user
        const isValid = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValid) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }
        // Check duplicate username
        const userCheck = await pool.request()
            .input('UserName', sql.VarChar, userName)
            .input('CompanyId', sql.Int, CompanyId)
            .input('LocationId', sql.Int, LocationId)
            .query(`
        SELECT 1 
        FROM UserMaster
        INNER JOIN UserCompanyMaster cum ON UserMaster.UserId = cum.UserId AND cum.CompanyId = @CompanyId AND cum.IsActive = 1 AND cum.DelMark = 0 And UserMaster.LocationId=@LocationId
        WHERE UserName = @UserName AND CompanyId = @CompanyId
          AND UserMaster.IsActive = 1
          AND UserMaster.DelMark = 0
    `);

        if (userCheck.recordset.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Username already exists'
            });
        }

        // Generate & hash password
        const plainPassword = generateRandomPassword();
        const hashedPassword = await hashPassword(plainPassword);

        // Insert user
        const result = await pool.request()
            .input('UserName', sql.VarChar, userName)
            .input('Name', sql.VarChar, Name)
            .input('MailId', sql.VarChar, MailId)
            .input('Password', sql.VarChar, hashedPassword)
            .input('RoleId', sql.Int, RoleId)
            .input('UserId', sql.Int, UserId)
            .input('DesignationId', sql.Int, DesignationId)
            .input('LocationId', sql.Int, LocationId)
            .query(`
                INSERT INTO UserMaster
                (UserName, Name, MailId, Password, RoleId, DesignationId, LocationId, IsActive, DelMark, CreatedOn, CreatedBy)
                OUTPUT INSERTED.UserId
                VALUES
                (@UserName, @Name, @MailId, @Password, @RoleId, @DesignationId, @LocationId, 1, 0, GETDATE(), @UserId)
            `);

        const newUserId = result.recordset[0].UserId;

        // Map user to company
        await pool.request()
            .input('UserId', sql.Int, newUserId)
            .input('CompanyId', sql.Int, CompanyId)
            .query(`
                INSERT INTO UserCompanyMaster (UserId, CompanyId, CreatedOn, CreatedBy)
                VALUES (@UserId, @CompanyId, GETDATE(), @UserId)
            `);
        const LocationNameResult = await pool.request()
            .input('LocationId', sql.Int, LocationId)
            .query(`
                SELECT LocationName
                FROM LocationMaster
                WHERE LocationId = @LocationId AND IsActive = 1 AND DelMark = 0
            `);
        const LocationName = LocationNameResult.recordset.length > 0 ? LocationNameResult.recordset[0].LocationName : '';

        // Send email
        await sendPasswordEmail(MailId, UserName, plainPassword, LocationName);

        res.json({
            success: true,
            message: 'User created successfully. Password sent on email.'
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
};

/* =========================================================
   USER MASTER - UPDATE
========================================================= */
const updateUserMaster = async (req, res) => {
    try {
        const { CompanyId, UserId, TargetUserId, Name, UserName, MailId, DesignationId, LocationId } = req.body;
        const userName = UserName.trim();
        const pool = await poolPromise;

        const isValid = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValid) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }
        const userCheck = await pool.request()
            .input('UserName', sql.VarChar, userName)
            .input('CompanyId', sql.Int, CompanyId)
            .input('TargetUserId', sql.Int, TargetUserId)
            .query(`
        SELECT 1 
        FROM UserMaster
        INNER JOIN UserCompanyMaster cum ON UserMaster.UserId = cum.UserId AND cum.CompanyId = @CompanyId AND cum.IsActive = 1 AND cum.DelMark = 0
        WHERE UserName = @UserName AND CompanyId = @CompanyId
          AND UserMaster.IsActive = 1
          AND UserMaster.DelMark = 0
          AND UserMaster.UserId <> @TargetUserId
    `);

        if (userCheck.recordset.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Username already exists'
            });
        }

        await pool.request()
            .input('TargetUserId', sql.Int, TargetUserId)
            .input('Name', sql.VarChar, Name)
            .input('UserName', sql.VarChar, userName)
            .input('MailId', sql.VarChar, MailId)
            .input('UserId', sql.Int, UserId)
            .input('DesignationId', sql.Int, DesignationId)
            .input('LocationId', sql.Int, LocationId)
            .query(`
                UPDATE UserMaster
                SET Name = @Name,
                    UserName = @UserName,
                    MailId = @MailId,
                    DesignationId = @DesignationId,
                    LocationId = @LocationId,
                    UpdatedOn = GETDATE(),
                    UpdatedBy = @UserId
                WHERE UserId = @TargetUserId
                  AND IsActive = 1
                  AND DelMark = 0
            `);

        res.json({ success: true, message: 'User updated successfully' });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/* =========================================================
   USER MASTER - DELETE (SOFT)
========================================================= */
const deleteUserMaster = async (req, res) => {
    try {
        const { CompanyId, UserId, TargetUserId } = req.body;
        const pool = await poolPromise;

        const isValid = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValid) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        await pool.request()
            .input('TargetUserId', sql.Int, TargetUserId)
            .input('UserId', sql.Int, UserId)
            .query(`
                UPDATE UserMaster
                SET IsActive = 0,
                    DelMark = 1,
                    UpdatedOn = GETDATE(),
                    UpdatedBy = @UserId
                WHERE UserId = @TargetUserId
            `);

        res.json({ success: true, message: 'User deleted successfully' });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
/* =========================================================
   COMPANY MASTER - ADD
========================================================= */
const addCompanyMaster = async (req, res) => {
    try {
        const { UserId, CompanyId, CompanyName, Address, ContactNo } = req.body;
        const pool = await poolPromise;

        const isValid = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValid) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        await pool.request()
            .input('CompanyName', sql.VarChar, CompanyName)
            .input('Address', sql.VarChar, Address)
            .input('ContactNo', sql.VarChar, ContactNo)
            .query(`
                INSERT INTO CompanyMaster
                (CompanyName, Address, ContactNo, IsActive, DelMark)
                VALUES
                (@CompanyName, @Address, @ContactNo, 1, 0)
            `);

        res.json({ success: true, message: 'Company added successfully' });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
/* =========================================================
   COMPANY MASTER - UPDATE
========================================================= */
const updateCompanyMaster = async (req, res) => {
    try {
        const { UserId, CompanyId, TargetCompanyId, CompanyName, Address, ContactNo } = req.body;
        const pool = await poolPromise;

        const isValid = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValid) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        await pool.request()
            .input('TargetCompanyId', sql.Int, TargetCompanyId)
            .input('CompanyName', sql.VarChar, CompanyName)
            .input('Address', sql.VarChar, Address)
            .input('ContactNo', sql.VarChar, ContactNo)
            .input('UserId', sql.Int, UserId)
            .query(`
                UPDATE CompanyMaster
                SET CompanyName = @CompanyName,
                    Address = @Address,
                    ContactNo = @ContactNo,
                    UpdatedOn = GETDATE(),
                    UpdatedBy = @UserId
                WHERE CompanyId = @TargetCompanyId
                  AND IsActive = 1
                  AND DelMark = 0
            `);

        res.json({ success: true, message: 'Company updated successfully' });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
/* =========================================================
   COMPANY MASTER - DELETE (SOFT)
========================================================= */
const deleteCompanyMaster = async (req, res) => {
    try {
        const { UserId, CompanyId, TargetCompanyId } = req.body;
        const pool = await poolPromise;

        const isValid = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValid) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        await pool.request()
            .input('TargetCompanyId', sql.Int, TargetCompanyId)
            .input('UserId', sql.Int, UserId)
            .query(`
                UPDATE CompanyMaster
                SET IsActive = 0,
                    DelMark = 1,
                    UpdatedOn = GETDATE(),
                    UpdatedBy = @UserId
                WHERE CompanyId = @TargetCompanyId
            `);

        res.json({ success: true, message: 'Company deleted successfully' });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/* =========================================================
   LOCATION MASTER - ADD
========================================================= */
const addLocationMaster = async (req, res) => {
    try {
        const { UserId, CompanyId, LocationName } = req.body;
        const locationName = LocationName.trim();
        const pool = await poolPromise;

        const isValid = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValid) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        const locationCheck = await pool.request()
    .input('LocationName', sql.VarChar, locationName)
    .query(`
        SELECT 1
        FROM LocationMaster
        WHERE LocationName = @LocationName
          AND IsActive = 1
          AND DelMark = 0
    `);

if (locationCheck.recordset.length > 0) {
    return res.status(409).json({
        success: false,
        message: 'Location name already exists'
    });
}


        await pool.request()
            .input('LocationName', sql.VarChar, locationName)
            .input('UserId', sql.Int, UserId)
            .query(`
                INSERT INTO LocationMaster
                (LocationName, IsActive, DelMark, CreatedOn, CreatedBy)
                VALUES
                (@LocationName, 1, 0, GETDATE(), @UserId)
            `);

        res.json({ success: true, message: 'Location added successfully' });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
/* =========================================================
   LOCATION MASTER - UPDATE
========================================================= */
const updateLocationMaster = async (req, res) => {
    try {
        const { UserId, CompanyId, LocationId, LocationName } = req.body;
        const locationName = LocationName.trim();
        const pool = await poolPromise;

        const isValid = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValid) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }
        const locationCheck = await pool.request()
    .input('LocationName', sql.VarChar, locationName)
    .input('LocationId', sql.Int, LocationId)
    .query(`
        SELECT 1
        FROM LocationMaster
        WHERE LocationName = @LocationName
          AND LocationId <> @LocationId
          AND IsActive = 1
          AND DelMark = 0
    `);

if (locationCheck.recordset.length > 0) {
    return res.status(409).json({
        success: false,
        message: 'Location name already exists'
    });
}


        await pool.request()
            .input('LocationId', sql.Int, LocationId)
            .input('LocationName', sql.VarChar, locationName)
            .input('UserId', sql.Int, UserId)
            .query(`
                UPDATE LocationMaster
                SET LocationName = @LocationName, 
                    UpdatedOn = GETDATE(),
                    UpdatedBy = @UserId
                WHERE LocationId = @LocationId
                  AND IsActive = 1
                  AND DelMark = 0
            `);

        res.json({ success: true, message: 'Location updated successfully' });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
/* =========================================================
   LOCATION MASTER - DELETE (SOFT)
========================================================= */
const deleteLocationMaster = async (req, res) => {
    try {
        const { UserId, CompanyId, LocationId } = req.body;
        const pool = await poolPromise;

        const isValid = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValid) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        await pool.request()
            .input('LocationId', sql.Int, LocationId)
            .input('UserId', sql.Int, UserId)
            .query(`
                UPDATE LocationMaster
                SET IsActive = 0,
                    DelMark = 1,
                    UpdatedOn = GETDATE(),
                    UpdatedBy = @UserId
                WHERE LocationId = @LocationId
            `);

        res.json({ success: true, message: 'Location deleted successfully' });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/* =========================================================
   CHANGE PASSWORD (SELF)
========================================================= */
const changePassword = async (req, res) => {
    try {
        const { userId, username, newPassword, oldPassword, otp } = req.body;
        
        const pool = await poolPromise;
        let usernameLocal = "";

        if (otp) {
            checkUsername = await pool.request()
                .input("userId", sql.Int, userId)
                .query(`SELECT UserName FROM UserMaster WHERE UserId = @userId AND IsActive = 1 AND DelMark = 0`);
            if (checkUsername.recordset.length === 0) {
                return res.status(404).json({ success: false, message: "User not found." });
            }
            usernameLocal = checkUsername.recordset[0].UserName;
            // OTP-based password change
            const otpResult = await pool.request()
                .input("userId", sql.Int, userId)
                .input("otp", sql.VarChar, otp)
                .query(`SELECT Expiry FROM OtpTable WHERE UserId = @userId AND Otp = @otp`);

            if (otpResult.recordset.length === 0) {
                return res.status(400).json({ success: false, message: "Invalid OTP." });
            }

            const expiry = otpResult.recordset[0].Expiry;
            if (new Date() > expiry) {
                return res.status(400).json({ success: false, message: "OTP has expired." });
            }
        } else if (oldPassword) {
            // Old-password-based password change
            usernameLocal= username;
            const userResult = await pool.request()
                .input("username", sql.VarChar, username)
                .query(`SELECT Password FROM UserMaster WHERE UserName = @username AND IsActive = 1 AND DelMark = 0`);

            if (userResult.recordset.length === 0) {
                return res.status(404).json({ success: false, message: "User not found." });
            }

            const dbPassword = userResult.recordset[0].Password;

            const isMatch = await comparePassword(oldPassword, dbPassword);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: "Old password is incorrect." });
            }

            const samePassword = await comparePassword(newPassword, dbPassword);
            if (samePassword) {
                return res.status(400).json({ success: false, message: "New password cannot be the same as the old password." });
            }
        } else {
            return res.status(400).json({ success: false, message: "Either OTP or old password is required." });
        }

        const hashedPassword = await hashPassword(newPassword);
        await pool.request()
            .input("username", sql.VarChar, usernameLocal)
            .input("password", sql.VarChar, hashedPassword)
            .query(`UPDATE UserMaster SET Password = @password WHERE UserName = @username`);

        res.json({ success: true, message: "Password changed successfully." });
    } catch (error) {
        console.error("Error in changePassword:", error);
        res.status(500).json({ success: false, message: "Failed to change password." });
    }
};



/* =========================================================
   RESET PASSWORD (SUPER USER)
========================================================= */
const resetUserPassword = async (req, res) => {
    try {
        const { CompanyId, UserId, TargetUserId } = req.body;
        const pool = await poolPromise;

        // Validate super user
        const isValid = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValid) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Get target user
        const userResult = await pool.request()
            .input('TargetUserId', sql.Int, TargetUserId)
            .query(`
                SELECT UserName, MailId
                FROM UserMaster
                WHERE UserId = @TargetUserId
                  AND IsActive = 1
                  AND DelMark = 0
            `);

        if (userResult.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Target user not found'
            });
        }

        const { UserName, MailId } = userResult.recordset[0];

        // Generate + hash password
        // const plainPassword = generateRandomPassword();
        const plainPassword = "123456";
        const hashedPassword = await hashPassword(plainPassword);

        // Update password
        await pool.request()
            .input('TargetUserId', sql.Int, TargetUserId)
            .input('Password', sql.VarChar, hashedPassword)
            .query(`
                UPDATE UserMaster
                SET Password = @Password,
                    UpdatedOn = GETDATE(),
                    UpdatedBy = @TargetUserId
                WHERE UserId = @TargetUserId
            `);

        // Send email
        await sendPasswordEmail(MailId, UserName, plainPassword);

        res.json({
            success: true,
            message: 'Password reset successfully and sent on email'
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
/* =========================================================
   DEPARTMENT MASTER
========================================================= */

// ADD
const addDepartment = async (req, res) => {
    try {
        const { CompanyId, UserId, DepartmentName } = req.body;
        const pool = await poolPromise;
        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }
        const isValidUser = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValidUser) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: SuperUser access required'
            });
        }
        // DUPLICACY CHECK
        const check = await pool.request()
            .input("DepartmentName", sql.NVarChar, DepartmentName)
            .input("CompanyId", sql.Int, CompanyId)
            .query(`
                SELECT 1
                FROM DepartmentMaster
                WHERE DepartmentName = @DepartmentName
                  AND CompanyId = @CompanyId
                  AND IsActive = 1 AND DelMark = 0
            `);

        if (check.recordset.length > 0) {
            return res.json({
                success: false,
                message: "Department already exists"
            });
        }
        await pool.request()
            .input("DepartmentName", sql.NVarChar, DepartmentName)
            .input("CompanyId", sql.Int, CompanyId)
            .input("UserId", sql.Int, UserId)
            .query(`
                INSERT INTO DepartmentMaster
                (DepartmentName, CompanyId, IsActive, DelMark, CreatedOn, CreatedBy)
                VALUES (@DepartmentName, @CompanyId, 1, 0, GETDATE(), @UserId)
            `);

        res.json({ success: true, message: "Department added successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// UPDATE
const updateDepartment = async (req, res) => {
    try {
        const { DepartmentId, DepartmentName, UserId, CompanyId } = req.body;
        const pool = await poolPromise;
        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }
        const isValidUser = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValidUser) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: SuperUser access required'
            });
        }
        // DUPLICACY CHECK
        const check = await pool.request()
            .input("DepartmentName", sql.NVarChar, DepartmentName)
            .input("DepartmentId", sql.Int, DepartmentId)
            .query(`
                SELECT 1
                FROM DepartmentMaster
                WHERE DepartmentName = @DepartmentName
                  AND DepartmentId <> @DepartmentId
                  AND IsActive = 1 AND DelMark = 0
            `);

        if (check.recordset.length > 0) {
            return res.json({
                success: false,
                message: "Department already exists"
            });
        }
        await pool.request()
            .input("DepartmentId", sql.Int, DepartmentId)
            .input("DepartmentName", sql.NVarChar, DepartmentName)
            .input("UserId", sql.Int, UserId)
            .query(`
                UPDATE DepartmentMaster
                SET DepartmentName = @DepartmentName,
                    UpdatedOn = GETDATE(),
                    UpdatedBy = @UserId
                WHERE DepartmentId = @DepartmentId AND DelMark = 0
            `);

        res.json({ success: true, message: "Department updated successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE
const deleteDepartment = async (req, res) => {
    try {
        const { DepartmentId, UserId, CompanyId } = req.body;
        const pool = await poolPromise;
        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }
        const isValidUser = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValidUser) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: SuperUser access required'
            });
        }

        await pool.request()
            .input("DepartmentId", sql.Int, DepartmentId)
            .input("UserId", sql.Int, UserId)
            .query(`
                UPDATE DepartmentMaster
                SET IsActive = 0, DelMark = 1,
                    UpdatedOn = GETDATE(),
                    UpdatedBy = @UserId
                WHERE DepartmentId = @DepartmentId
            `);

        res.json({ success: true, message: "Department deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// READ
const getDepartments = async (req, res) => {
    try {
        const { CompanyId,UserId } = req.body;
        const pool = await poolPromise;
        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }


        const result = await pool.request()
            .input("CompanyId", sql.Int, CompanyId)
            .query(`
                SELECT *
                FROM DepartmentMaster
                WHERE CompanyId = @CompanyId
                  AND IsActive = 1 AND DelMark = 0
                ORDER BY DepartmentName
            `);

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/* =========================================================
   ALARM POINT MASTER
========================================================= */

// ADD
const addAlarmPoint = async (req, res) => {
    try {
        const { AlarmPointName, CompanyId, UserId, LocationId } = req.body;
        const pool = await poolPromise;
        if (!CompanyId || !UserId || !LocationId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId, UserId, and LocationId are required'
            });
        }
        const isValidUser = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValidUser) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: SuperUser access required'
            });
        }
        const check = await pool.request()
            .input("AlarmPointName", sql.NVarChar, AlarmPointName)
            .input("CompanyId", sql.Int, CompanyId)
            .input("LocationId", sql.Int, LocationId)
            .query(`
                SELECT 1
                FROM AlarmPointMaster
                WHERE AlarmPointName = @AlarmPointName
                  AND CompanyId = @CompanyId
                  AND LocationId = @LocationId
                  AND IsActive = 1 AND DelMark = 0
            `);

        if (check.recordset.length > 0) {
            return res.json({ success: false, message: "Alarm point already exists" });
        }
        await pool.request()
            .input("AlarmPointName", sql.NVarChar, AlarmPointName)
            .input("CompanyId", sql.Int, CompanyId)
            .input("UserId", sql.Int, UserId)
            .input("LocationId", sql.Int, LocationId)
            .query(`
                INSERT INTO AlarmPointMaster
                (AlarmPointName, CompanyId, LocationId, IsActive, DelMark, CreatedOn, CreatedBy)
                VALUES (@AlarmPointName, @CompanyId, @LocationId, 1, 0, GETDATE(), @UserId)
            `);

        res.json({ success: true, message: "Alarm point added successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// UPDATE
const updateAlarmPoint = async (req, res) => {
    try {
        const { AlarmPointId, AlarmPointName, UserId, CompanyId, LocationId } = req.body;
        const pool = await poolPromise;
        if (!CompanyId || !UserId || !LocationId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId, UserId, and LocationId are required'
            });
        }
        const isValidUser = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValidUser) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: SuperUser access required'
            });
        }
        const check = await pool.request()
            .input("AlarmPointName", sql.NVarChar, AlarmPointName)
            .input("AlarmPointId", sql.Int, AlarmPointId)
            .input("LocationId", sql.Int, LocationId)
            .query(`
                SELECT 1
                FROM AlarmPointMaster
                WHERE AlarmPointName = @AlarmPointName
                  AND AlarmPointId <> @AlarmPointId
                  AND LocationId = @LocationId
                  AND IsActive = 1 AND DelMark = 0
            `);

        if (check.recordset.length > 0) {
            return res.json({ success: false, message: "Alarm point already exists" });
        }
        await pool.request()
            .input("AlarmPointId", sql.Int, AlarmPointId)
            .input("AlarmPointName", sql.NVarChar, AlarmPointName)
            .input("UserId", sql.Int, UserId)
            .input("LocationId", sql.Int, LocationId)
            .query(`
                UPDATE AlarmPointMaster
                SET AlarmPointName = @AlarmPointName, LocationId = @LocationId,
                    UpdatedOn = GETDATE(),
                    UpdatedBy = @UserId
                WHERE AlarmPointId = @AlarmPointId AND DelMark = 0
            `);

        res.json({ success: true, message: "Alarm point updated successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE
const deleteAlarmPoint = async (req, res) => {
    try {
        const { AlarmPointId, UserId, CompanyId } = req.body;
        const pool = await poolPromise;
        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }
        const isValidUser = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValidUser) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: SuperUser access required'
            });
        }
        await pool.request()
            .input("AlarmPointId", sql.Int, AlarmPointId)
            .input("UserId", sql.Int, UserId)
            .query(`
                UPDATE AlarmPointMaster
                SET IsActive = 0, DelMark = 1,
                    UpdatedOn = GETDATE(),
                    UpdatedBy = @UserId
                WHERE AlarmPointId = @AlarmPointId
            `);

        res.json({ success: true, message: "Alarm point deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// READ
const getAlarmPoints = async (req, res) => {
    try {
        const { CompanyId, UserId, LocationId } = req.body;
        const pool = await poolPromise;
        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }
      

        const result = await pool.request()
            .input("CompanyId", sql.Int, CompanyId)
            .input("LocationId", sql.Int, LocationId)
            .query(`
                SELECT *
                FROM AlarmPointMaster
                WHERE CompanyId = @CompanyId
                  AND LocationId = @LocationId
                  AND IsActive = 1 AND DelMark = 0
                ORDER BY AlarmPointName
            `);

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/* =========================================================
   WORK LOCATION MASTER
========================================================= */

// ADD
const addWorkLocation = async (req, res) => {
    try {
        const { WorkLocationName, CompanyId, UserId, LocationId } = req.body;
        const pool = await poolPromise;
        if (!CompanyId || !UserId || !LocationId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId, UserId, and LocationId are required'
            });
        }
        const isValidUser = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValidUser) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: SuperUser access required'
            });
        }
        const check = await pool.request()
            .input("WorkLocationName", sql.NVarChar, WorkLocationName)
            .input("CompanyId", sql.Int, CompanyId)
            .input("LocationId", sql.Int, LocationId)
            .query(`
                SELECT 1
                FROM WorkLocationMaster
                WHERE WorkLocationName = @WorkLocationName
                  AND CompanyId = @CompanyId
                  AND LocationId = @LocationId
                  AND IsActive = 1 AND DelMark = 0
            `);

        if (check.recordset.length > 0) {
            return res.json({ success: false, message: "Work location already exists" });
        }
        await pool.request()
            .input("WorkLocationName", sql.NVarChar, WorkLocationName)
            .input("CompanyId", sql.Int, CompanyId)
            .input("LocationId", sql.Int, LocationId)
            .input("UserId", sql.Int, UserId)
            .query(`
                INSERT INTO WorkLocationMaster
                (WorkLocationName, CompanyId, LocationId, IsActive, DelMark, CreatedOn, CreatedBy)
                VALUES (@WorkLocationName, @CompanyId, @LocationId, 1, 0, GETDATE(), @UserId)
            `);

        res.json({ success: true, message: "Work location added successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// UPDATE
const updateWorkLocation = async (req, res) => {
    try {
        const { WorkLocationId, WorkLocationName, UserId, CompanyId, LocationId } = req.body;
        const pool = await poolPromise;
        if (!CompanyId || !UserId || !LocationId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId, UserId, and LocationId are required'
            });
        }
        const isValidUser = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValidUser) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: SuperUser access required'
            });
        }
        const check = await pool.request()
            .input("WorkLocationName", sql.NVarChar, WorkLocationName)
            .input("WorkLocationId", sql.Int, WorkLocationId)
            .input("LocationId", sql.Int, LocationId)
            .query(`
                SELECT 1
                FROM WorkLocationMaster
                WHERE WorkLocationName = @WorkLocationName
                  AND WorkLocationId <> @WorkLocationId
                  AND LocationId = @LocationId
                  AND IsActive = 1 AND DelMark = 0
            `);

        if (check.recordset.length > 0) {
            return res.json({ success: false, message: "Work location already exists" });
        }
        await pool.request()
            .input("WorkLocationId", sql.Int, WorkLocationId)
            .input("WorkLocationName", sql.NVarChar, WorkLocationName)
            .input("UserId", sql.Int, UserId)
            .input("LocationId", sql.Int, LocationId)
            .query(`
                UPDATE WorkLocationMaster
                SET WorkLocationName = @WorkLocationName,
                    UpdatedOn = GETDATE(),
                    UpdatedBy = @UserId,
                    LocationId = @LocationId
                WHERE WorkLocationId = @WorkLocationId AND DelMark = 0
            `);

        res.json({ success: true, message: "Work location updated successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE
const deleteWorkLocation = async (req, res) => {
    try {
        const { WorkLocationId, UserId, CompanyId } = req.body;
        const pool = await poolPromise;
        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }
        const isValidUser = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValidUser) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: SuperUser access required'
            });
        }

        await pool.request()
            .input("WorkLocationId", sql.Int, WorkLocationId)
            .input("UserId", sql.Int, UserId)
            .query(`
                UPDATE WorkLocationMaster
                SET IsActive = 0, DelMark = 1,
                    UpdatedOn = GETDATE(),
                    UpdatedBy = @UserId
                WHERE WorkLocationId = @WorkLocationId
            `);

        res.json({ success: true, message: "Work location deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// READ
const getWorkLocations = async (req, res) => {
    try {
        const { CompanyId, UserId, LocationId } = req.body;
        const pool = await poolPromise;

        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }
        
        const result = await pool.request()
            .input("CompanyId", sql.Int, CompanyId)
            .input("LocationId", sql.Int, LocationId)
            .query(`
                SELECT *
                FROM WorkLocationMaster
                WHERE CompanyId = @CompanyId
                  AND LocationId = @LocationId
                  AND IsActive = 1 AND DelMark = 0
                ORDER BY WorkLocationName
            `);

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const addDesignation = async (req, res) => {
    try {
        const { DesignationName, CompanyId, UserId } = req.body;
        const pool = await poolPromise;

        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }
        const isValidUser = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValidUser) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: SuperUser access required'
            });
        }
        // DUPLICACY CHECK
        const check = await pool.request()
            .input("DesignationName", sql.NVarChar, DesignationName)
            .input("CompanyId", sql.Int, CompanyId)
            .query(`
                SELECT 1
                FROM DesignationMaster
                WHERE DesignationName = @DesignationName
                  AND CompanyId = @CompanyId
                  AND IsActive = 1 AND DelMark = 0
            `);

        if (check.recordset.length > 0) {
            return res.json({
                success: false,
                message: "Designation already exists"
            });
        }

        // INSERT
        await pool.request()
            .input("DesignationName", sql.NVarChar, DesignationName)
            .input("CompanyId", sql.Int, CompanyId)
            .input("UserId", sql.Int, UserId)
            .query(`
                INSERT INTO DesignationMaster
                (DesignationName, CompanyId, IsActive, DelMark, CreatedOn, CreatedBy)
                VALUES (@DesignationName, @CompanyId, 1, 0, GETDATE(), @UserId)
            `);

        res.json({ success: true, message: "Designation added successfully" });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const updateDesignation = async (req, res) => {
    try {
        const { DesignationId, DesignationName, UserId, CompanyId } = req.body;
        const pool = await poolPromise;

        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }
        const isValidUser = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValidUser) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: SuperUser access required'
            });
        }

        // DUPLICACY CHECK
        const check = await pool.request()
            .input("DesignationName", sql.NVarChar, DesignationName)
            .input("DesignationId", sql.Int, DesignationId)
            .query(`
                SELECT 1
                FROM DesignationMaster
                WHERE DesignationName = @DesignationName
                  AND DesignationId <> @DesignationId
                  AND IsActive = 1 AND DelMark = 0
            `);

        if (check.recordset.length > 0) {
            return res.json({
                success: false,
                message: "Designation already exists"
            });
        }

        // UPDATE
        await pool.request()
            .input("DesignationId", sql.Int, DesignationId)
            .input("DesignationName", sql.NVarChar, DesignationName)
            .input("UserId", sql.Int, UserId)
            .query(`
                UPDATE DesignationMaster
                SET DesignationName = @DesignationName,
                    UpdatedOn = GETDATE(),
                    UpdatedBy = @UserId
                WHERE DesignationId = @DesignationId
                  AND DelMark = 0
            `);

        res.json({ success: true, message: "Designation updated successfully" });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const deleteDesignation = async (req, res) => {
    try {
        const { DesignationId, UserId, CompanyId } = req.body;
        const pool = await poolPromise;
        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }
        const isValidUser = await validateSuperUser(pool, CompanyId, UserId);
        if (!isValidUser) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: SuperUser access required'
            });
        }

        await pool.request()
            .input("DesignationId", sql.Int, DesignationId)
            .input("UserId", sql.Int, UserId)
            .query(`
                UPDATE DesignationMaster
                SET IsActive = 0,
                    DelMark = 1,
                    UpdatedOn = GETDATE(),
                    UpdatedBy = @UserId
                WHERE DesignationId = @DesignationId
            `);

        res.json({ success: true, message: "Designation deleted successfully" });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const getDesignations = async (req, res) => {
    try {
        const { CompanyId, UserId } = req.body;
        const pool = await poolPromise;

        if (!CompanyId || !UserId) {
            return res.status(400).json({
                success: false,
                message: 'CompanyId and UserId are required'
            });
        }
        const result = await pool.request()
            .input("CompanyId", sql.Int, CompanyId)
            .query(`
                SELECT *
                FROM DesignationMaster
                WHERE CompanyId = @CompanyId
                  AND IsActive = 1
                  AND DelMark = 0
                ORDER BY DesignationName
            `);

        res.json({ success: true, data: result.recordset });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Generate a 6-digit OTP
const generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP API
const sendOtp = async (req, res) => {
    try {
        const { username, email } = req.body;

        if (!username || !email) {
            return res.status(400).json({ success: false, message: "Username and email are required." });
        }

        const pool = await poolPromise;
        const userResult = await pool.request()
            .input("username", sql.VarChar, username)
            .input("email", sql.VarChar, email)
            .query(`SELECT UserId FROM UserMaster WHERE UserName = @username AND MailId = @email AND IsActive = 1 AND DelMark = 0`);

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const userId = userResult.recordset[0].UserId;
        const otp = generateOtp();
        const expiry = new Date(Date.now() + 10 * 60 * 1000); // OTP valid for 10 minutes

        await pool.request()
            .input("userId", sql.Int, userId)
            .input("otp", sql.VarChar, otp)
            .input("expiry", sql.DateTime, expiry)
            .query(`
                MERGE INTO OtpTable AS target
                USING (SELECT @userId AS UserId) AS source
                ON target.UserId = source.UserId
                WHEN MATCHED THEN
                    UPDATE SET Otp = @otp, Expiry = @expiry
                WHEN NOT MATCHED THEN
                    INSERT (UserId, Otp, Expiry) VALUES (@userId, @otp, @expiry);
            `);

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Your OTP Code",
            text: `Your OTP code is ${otp}. It is valid for 10 minutes.`
        });

        res.json({ success: true, message: "OTP sent successfully.", userId: userId , username: username, email: email});
    } catch (error) {
        console.error("Error in sendOtp:", error);
        res.status(500).json({ success: false, message: "Failed to send OTP." });
    }
};

// Verify OTP API
const verifyOtp = async (req, res) => {
    try {
        const { userId, otp } = req.body;

        if (!userId || !otp) {
            return res.status(400).json({ success: false, message: "UserId and OTP are required." });
        }

        const checkUserId = pool.request()
            .input("userId", sql.Int, userId)
            .query(`SELECT 1 FROM UserMaster WHERE UserId = @userId AND IsActive = 1 AND DelMark = 0`);
        const userExists = (await checkUserId).recordset.length > 0;

        if (!userExists) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const pool = await poolPromise;
        const otpResult = await pool.request()
            .input("userId", sql.Int, userId)
            .input("otp", sql.VarChar, otp)
            .query(`SELECT Expiry FROM OtpTable WHERE UserId = @userId AND Otp = @otp`);

        if (otpResult.recordset.length === 0) {
            return res.status(400).json({ success: false, message: "Invalid OTP." });
        }

        const expiry = otpResult.recordset[0].Expiry;
        if (new Date() > expiry) {
            return res.status(400).json({ success: false, message: "OTP has expired." });
        }

        res.json({ success: true, message: "OTP verified successfully." , userId: userId, username: userExists.username, email: userExists.email});
    } catch (error) {
        console.error("Error in verifyOtp:", error);
        res.status(500).json({ success: false, message: "Failed to verify OTP." });
    }
};





module.exports = {
    validateSuperUser,
    getUserMasterData,
    getLocationMasterData,
    getCompanyMasterData,
    addUserMaster,
    updateUserMaster,
    deleteUserMaster,
    addCompanyMaster,
    updateCompanyMaster,
    deleteCompanyMaster,
    addLocationMaster,
    updateLocationMaster,
    deleteLocationMaster,
    getRoleMasterData,
    changePassword,
    hashPassword,
    comparePassword,
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
};
