const { poolPromise } = require("../config/db");

const getLastPermitNumber = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .query("SELECT TOP 1 PermitNumber FROM PermitMaster ORDER BY PermitID DESC");

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "No permit found." });
    }

    res.json({
      message: "✅ Last PermitNumber fetched successfully",
      permitNumber: result.recordset[0].PermitNumber,
    });
  } catch (error) {
    res.status(500).json({
      message: "❌ Failed to fetch last PermitNumber",
      error: error.message,
    });
  }
};

module.exports = getLastPermitNumber;
