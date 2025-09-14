// controllers/loginController.js
const { poolPromise, sql } = require('../config/db');

const login = async (req, res) => {
  try {
    const { UserName, Password } = req.body;

    if (!UserName || !Password) {
      return res.status(400).json({
        success: false,
        message: "UserName and Password are required."
      });
    }

    // Get connection pool
    const pool = await poolPromise;

    // Query to check user and fetch role, including Email
    const result = await pool.request()
      .input('UserName', sql.NVarChar, UserName)
      .input('Password', sql.NVarChar, Password)
      .query(`
        SELECT u.UserId, u.UserName, u.Name, u.MailId, u.RoleId, r.RoleName
        FROM UserMaster u
        INNER JOIN RoleMaster r ON u.RoleId = r.RoleId
        WHERE u.UserName = @UserName AND u.Password = @Password
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password."
      });
    }

    const user = result.recordset[0];

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        UserId: user.UserId,
        UserName: user.UserName,
        Name: user.Name,
        Email: user.MailId,
        RoleId: user.RoleId,
        RoleName: user.RoleName
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
};

module.exports = { login };
