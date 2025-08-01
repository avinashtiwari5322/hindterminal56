const nodemailer = require('nodemailer')
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

module.exports = transporter;