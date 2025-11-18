# SMTP Email Configuration

This document describes the email system migration from Google OAuth to SMTP authentication.

## Overview

The Firebase Cloud Functions now use **SMTP with nodemailer** to send emails instead of Google OAuth. This simplifies the email sending process and eliminates the need for OAuth tokens and Google API credentials.

## Changes Made

### 1. Dependencies Updated
- **Removed**: `googleapis` package
- **Added**: `nodemailer` package for SMTP email sending

### 2. Secret Configuration
The following Firebase secrets are now used:
- `SMTP_USER`: Email address (uspeertutoring@gmail.com)
- `SMTP_PASSWORD`: Gmail app password (teiy zvdm uplv ddnv)

### 3. Code Changes
- Replaced `getGmailClient()` OAuth function with `createEmailTransporter()` SMTP configuration
- Removed `makeEmail()` RFC 5322 encoding function (not needed with nodemailer)
- Added `sendEmail()` helper function using nodemailer's simpler API
- Updated all Cloud Functions to use SMTP secrets instead of OAuth secrets

### 4. Email Functions Updated
The following Cloud Functions now use SMTP:
- `confirmSessionEmail` - Sends session confirmation emails
- `onClassRequestCreated` - Sends class request notifications
- `onClassRequestApproved` - Sends approval confirmation emails

## Setup Instructions

### Option 1: Using PowerShell Script (Recommended)

Run the provided PowerShell script from the functions directory:

```powershell
cd functions
.\setup-smtp-secrets.ps1
```

### Option 2: Manual Setup

1. **Set SMTP_USER secret:**
```powershell
echo "uspeertutoring@gmail.com" | firebase functions:secrets:set SMTP_USER
```

2. **Set SMTP_PASSWORD secret:**
```powershell
echo "teiy zvdm uplv ddnv" | firebase functions:secrets:set SMTP_PASSWORD
```

### Option 3: Using Firebase Console

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to Functions → Secrets
4. Create two secrets:
   - Name: `SMTP_USER`, Value: `uspeertutoring@gmail.com`
   - Name: `SMTP_PASSWORD`, Value: `teiy zvdm uplv ddnv`

## Deploying the Changes

After setting up the secrets, deploy the updated functions:

```powershell
firebase deploy --only functions
```

## Testing

To test the email functionality locally with the Firebase emulator:

1. Set environment variables in your local terminal:
```powershell
$env:SMTP_USER="uspeertutoring@gmail.com"
$env:SMTP_PASSWORD="teiy zvdm uplv ddnv"
```

2. Start the Firebase emulators:
```powershell
firebase emulators:start
```

3. Trigger a function (create a session, submit a class request, etc.)
4. Check the console logs to verify email sending

## SMTP Configuration Details

- **Host**: smtp.gmail.com
- **Port**: 587 (STARTTLS)
- **Authentication**: Username/password
- **From Address**: "HW Peer Tutoring" <uspeertutoring@gmail.com>

## Security Notes

⚠️ **Important**: The Gmail app password is stored as a Firebase secret and should never be committed to version control.

The app password (`teiy zvdm uplv ddnv`) is a Gmail-specific app password that:
- Only works for SMTP authentication
- Can be revoked at any time from Google Account settings
- Does not provide access to the full Gmail account

## Troubleshooting

### Emails not sending?

1. **Check secret configuration:**
```powershell
firebase functions:secrets:access SMTP_USER
firebase functions:secrets:access SMTP_PASSWORD
```

2. **Check function logs:**
```powershell
firebase functions:log
```

3. **Verify Gmail app password:**
   - Ensure the app password is still valid in Google Account settings
   - Generate a new app password if needed

### "Invalid login" errors?

- Verify the SMTP_PASSWORD is correct
- Ensure 2-Step Verification is enabled on the Gmail account
- Check that the app password hasn't been revoked

### Emails going to spam?

- Ensure the "From" address matches the authenticated SMTP user
- Consider adding SPF/DKIM records for your domain (if using custom domain)
- Ask recipients to mark emails as "Not Spam"

## Migration Notes

### Old System (OAuth)
- Required Google OAuth 2.0 credentials
- Used Gmail API with refresh tokens
- Required RFC 5322 email encoding
- More complex setup and maintenance

### New System (SMTP)
- Simple SMTP authentication
- Direct email sending via nodemailer
- No special encoding required
- Easier to configure and maintain

## Additional Resources

- [Nodemailer Documentation](https://nodemailer.com/)
- [Gmail SMTP Settings](https://support.google.com/mail/answer/7126229)
- [Firebase Functions Secrets](https://firebase.google.com/docs/functions/config-env#secret-manager)

