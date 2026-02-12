-- Create or update the OTP table
CREATE TABLE OtpTable (
    UserId INT NOT NULL PRIMARY KEY,
    Otp VARCHAR(6) NOT NULL,
    Expiry DATETIME NOT NULL,
    CONSTRAINT FK_User FOREIGN KEY (UserId) REFERENCES UserMaster(UserId) ON DELETE CASCADE
);

-- If the table already exists, ensure it has the correct structure
IF COL_LENGTH('OtpTable', 'Otp') IS NULL
BEGIN
    ALTER TABLE OtpTable ADD Otp VARCHAR(6) NOT NULL;
END

IF COL_LENGTH('OtpTable', 'Expiry') IS NULL
BEGIN
    ALTER TABLE OtpTable ADD Expiry DATETIME NOT NULL;
END;