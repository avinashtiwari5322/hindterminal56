// // controllers/loginController.js
// const { poolPromise, sql } = require('../config/db');
// const {hashPassword, comparePassword} = require('./masterController').hashPassword;
// const login = async (req, res) => {
//   try {
//     const { UserName, Password } = req.body;

//     if (!UserName || !Password) {
//       return res.status(400).json({
//         success: false,
//         message: "UserName and Password are required."
//       });
//     }

//     // Get connection pool
//     const pool = await poolPromise;

//     // Query to check user and fetch role, including Email
//     const result = await pool.request()
//       .input('UserName', sql.NVarChar, UserName)
//       .input('Password', sql.NVarChar, Password)
//       .query(`
//         SELECT u.UserId, u.UserName, u.Name, u.MailId, u.RoleId, r.RoleName, uc.CompanyId
//         FROM UserMaster u
//         INNER JOIN RoleMaster r ON u.RoleId = r.RoleId
//         INNER JOIN UserCompanyMaster uc ON u.UserId = uc.UserId
//         WHERE u.UserName = @UserName AND u.Password = @Password AND u.IsActive = 1 AND u.DelMark = 0
//       `);

//     if (result.recordset.length === 0) {
//       return res.status(401).json({
//         success: false,
//         message: "Invalid username or password."
//       });
//     }

//     const user = result.recordset[0];

//     return res.status(200).json({
//       success: true,
//       message: "Login successful.",
//       data: {
//         UserId: user.UserId,
//         UserName: user.UserName,
//         Name: user.Name,
//         Email: user.MailId,
//         RoleId: user.RoleId,
//         RoleName: user.RoleName,
//         CompanyId: user.CompanyId
//       }
//     });

//   } catch (err) {
//     console.error("Login error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error."
//     });
//   }
// };

// module.exports = { login };

// controllers/loginController.js
const { poolPromise, sql } = require('../config/db');
const { comparePassword } = require('./masterController'); // ✅ correct import

const login = async (req, res) => {
    try {
        const { UserName, Password } = req.body;

        if (!UserName || !Password) {
            return res.status(400).json({
                success: false,
                message: "UserName and Password are required"
            });
        }

        const pool = await poolPromise;

        // 1️⃣ Fetch user with hashed password
        const result = await pool.request()
            .input('UserName', sql.VarChar, UserName)
            .query(`
                SELECT 
                    u.UserId,
                    u.UserName,
                    u.Name,
                    u.MailId,
                    u.Password,
                    u.RoleId,
                    r.RoleName,
                    uc.CompanyId
                FROM UserMaster u
                INNER JOIN RoleMaster r ON u.RoleId = r.RoleId
                INNER JOIN UserCompanyMaster uc ON u.UserId = uc.UserId
                WHERE u.UserName = @UserName
                  AND u.IsActive = 1
                  AND u.DelMark = 0
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password"
            });
        }

        const user = result.recordset[0];

        // 2️⃣ Compare password using bcrypt
        const isMatch = await comparePassword(Password, user.Password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password"
            });
        }

        // 3️⃣ Success response (never send password)
        res.status(200).json({
            success: true,
            message: "Login successful",
            data: {
                UserId: user.UserId,
                UserName: user.UserName,
                Name: user.Name,
                Email: user.MailId,
                RoleId: user.RoleId,
                RoleName: user.RoleName,
                CompanyId: user.CompanyId
            }
        });

    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

module.exports = { login };
