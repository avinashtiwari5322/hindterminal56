const express = require("express");
const router = express.Router();
const {
  createPermitAdditionalData,
  getPermitAdditionalData,
  updatePermitAdditionalData,
} = require("../interfaces/adminController");

// POST: Create a new permit additional data record
router.post("/", createPermitAdditionalData);

// GET: Retrieve a permit additional data record by ID
router.get("/:id", getPermitAdditionalData);

// PUT: Update a permit additional data record by ID
router.put("/:id", updatePermitAdditionalData);

module.exports = router;
