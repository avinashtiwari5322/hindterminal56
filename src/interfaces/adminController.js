const { poolPromise, sql } = require("../config/db");

// POST: Create a new PermitAdditionalData record
const createPermitAdditionalData = async (req, res) => {
  try {
    const {
      PermitID,
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
      FileName,
      FileSize,
      FileType,
    } = req.body;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("PermitID", sql.Int, PermitID)
      .input("ScaffoldChecked", sql.Bit, ScaffoldChecked)
      .input("ScaffoldTagged", sql.Bit, ScaffoldTagged)
      .input("ScaffoldRechecked", sql.Bit, ScaffoldRechecked)
      .input("ScaffoldErected", sql.Bit, ScaffoldErected)
      .input("HangingBaskets", sql.Bit, HangingBaskets)
      .input("PlatformSafe", sql.Bit, PlatformSafe)
      .input("CatLadders", sql.Bit, CatLadders)
      .input("EdgeProtection", sql.Bit, EdgeProtection)
      .input("Platforms", sql.Bit, Platforms)
      .input("SafetyHarness", sql.Bit, SafetyHarness)
      .input("EnergyPrecautions", sql.Bit, EnergyPrecautions)
      .input("Illumination", sql.Bit, Illumination)
      .input("UnguardedAreas", sql.Bit, UnguardedAreas)
      .input("FallProtection", sql.Bit, FallProtection)
      .input("AccessMeans", sql.Bit, AccessMeans)
      .input("SafetyHelmet", sql.Bit, SafetyHelmet)
      .input("SafetyJacket", sql.Bit, SafetyJacket)
      .input("SafetyShoes", sql.Bit, SafetyShoes)
      .input("Gloves", sql.Bit, Gloves)
      .input("SafetyGoggles", sql.Bit, SafetyGoggles)
      .input("FaceShield", sql.Bit, FaceShield)
      .input("DustMask", sql.Bit, DustMask)
      .input("EarPlugEarmuff", sql.Bit, EarPlugEarmuff)
      .input("AntiSlipFootwear", sql.Bit, AntiSlipFootwear)
      .input("SafetyNet", sql.Bit, SafetyNet)
      .input("AnchorPointLifelines", sql.Bit, AnchorPointLifelines)
      .input("SelfRetractingLifeline", sql.Bit, SelfRetractingLifeline)
      .input("FullBodyHarness", sql.Bit, FullBodyHarness)
      .input("FileName", sql.NVarChar(255), FileName)
      .input("FileSize", sql.BigInt, FileSize)
      .input("FileType", sql.NVarChar(100), FileType).query(`
                INSERT INTO PermitAdditionalData (
                    PermitID, ScaffoldChecked, ScaffoldTagged, ScaffoldRechecked, ScaffoldErected,
                    HangingBaskets, PlatformSafe, CatLadders, EdgeProtection,
                    Platforms, SafetyHarness, EnergyPrecautions, Illumination,
                    UnguardedAreas, FallProtection, AccessMeans,
                    SafetyHelmet, SafetyJacket, SafetyShoes, Gloves, SafetyGoggles,
                    FaceShield, DustMask, EarPlugEarmuff, AntiSlipFootwear, SafetyNet,
                    AnchorPointLifelines, SelfRetractingLifeline, FullBodyHarness,
                    FileName, FileSize, FileType
                )
                VALUES (
                    @PermitID, @ScaffoldChecked, @ScaffoldTagged, @ScaffoldRechecked, @ScaffoldErected,
                    @HangingBaskets, @PlatformSafe, @CatLadders, @EdgeProtection,
                    @Platforms, @SafetyHarness, @EnergyPrecautions, @Illumination,
                    @UnguardedAreas, @FallProtection, @AccessMeans,
                    @SafetyHelmet, @SafetyJacket, @SafetyShoes, @Gloves, @SafetyGoggles,
                    @FaceShield, @DustMask, @EarPlugEarmuff, @AntiSlipFootwear, @SafetyNet,
                    @AnchorPointLifelines, @SelfRetractingLifeline, @FullBodyHarness,
                    @FileName, @FileSize, @FileType
                );
                SELECT SCOPE_IDENTITY() AS AdditionalDataID;
            `);

    res.status(201).json({
      message: "Permit additional data saved successfully",
      AdditionalDataID: result.recordset[0].AdditionalDataID,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to save permit additional data" });
  }
};

// GET: Retrieve a PermitAdditionalData record by AdditionalDataID
const getPermitAdditionalData = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;

    const result = await pool.request().input("AdditionalDataID", sql.Int, id)
      .query(`
                SELECT * FROM PermitAdditionalData
                WHERE AdditionalDataID = @AdditionalDataID
            `);

    if (result.recordset.length === 0) {
      return res
        .status(404)
        .json({ error: "Permit additional data not found" });
    }

    res.status(200).json(result.recordset[0]);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Failed to retrieve permit additional data" });
  }
};

// PUT: Update a PermitAdditionalData record by AdditionalDataID
const updatePermitAdditionalData = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      PermitID,
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
      FileName,
      FileSize,
      FileType,
    } = req.body;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("AdditionalDataID", sql.Int, id)
      .input("PermitID", sql.Int, PermitID)
      .input("ScaffoldChecked", sql.Bit, ScaffoldChecked)
      .input("ScaffoldTagged", sql.Bit, ScaffoldTagged)
      .input("ScaffoldRechecked", sql.Bit, ScaffoldRechecked)
      .input("ScaffoldErected", sql.Bit, ScaffoldErected)
      .input("HangingBaskets", sql.Bit, HangingBaskets)
      .input("PlatformSafe", sql.Bit, PlatformSafe)
      .input("CatLadders", sql.Bit, CatLadders)
      .input("EdgeProtection", sql.Bit, EdgeProtection)
      .input("Platforms", sql.Bit, Platforms)
      .input("SafetyHarness", sql.Bit, SafetyHarness)
      .input("EnergyPrecautions", sql.Bit, EnergyPrecautions)
      .input("Illumination", sql.Bit, Illumination)
      .input("UnguardedAreas", sql.Bit, UnguardedAreas)
      .input("FallProtection", sql.Bit, FallProtection)
      .input("AccessMeans", sql.Bit, AccessMeans)
      .input("SafetyHelmet", sql.Bit, SafetyHelmet)
      .input("SafetyJacket", sql.Bit, SafetyJacket)
      .input("SafetyShoes", sql.Bit, SafetyShoes)
      .input("Gloves", sql.Bit, Gloves)
      .input("SafetyGoggles", sql.Bit, SafetyGoggles)
      .input("FaceShield", sql.Bit, FaceShield)
      .input("DustMask", sql.Bit, DustMask)
      .input("EarPlugEarmuff", sql.Bit, EarPlugEarmuff)
      .input("AntiSlipFootwear", sql.Bit, AntiSlipFootwear)
      .input("SafetyNet", sql.Bit, SafetyNet)
      .input("AnchorPointLifelines", sql.Bit, AnchorPointLifelines)
      .input("SelfRetractingLifeline", sql.Bit, SelfRetractingLifeline)
      .input("FullBodyHarness", sql.Bit, FullBodyHarness)
      .input("FileName", sql.NVarChar(255), FileName)
      .input("FileSize", sql.BigInt, FileSize)
      .input("FileType", sql.NVarChar(100), FileType).query(`
                UPDATE PermitAdditionalData
                SET
                    PermitID = @PermitID,
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
                    FileType = @FileType
                WHERE AdditionalDataID = @AdditionalDataID
            `);

    if (result.rowsAffected[0] === 0) {
      return res
        .status(404)
        .json({ error: "Permit additional data not found" });
    }

    res
      .status(200)
      .json({ message: "Permit additional data updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update permit additional data" });
  }
};

module.exports = {
  createPermitAdditionalData,
  getPermitAdditionalData,
  updatePermitAdditionalData,
};
