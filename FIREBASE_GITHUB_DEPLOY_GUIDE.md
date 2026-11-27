# Firebase Hosting (`web.app`) + GitHub Auto-Deploy Guide

This project is fully configured for **Firebase Hosting** (`https://internal-technical-audit-3c4a2.web.app`) with **GitHub Actions** automatic deployment.

## Live URL
- Primary URL: `https://internal-technical-audit-3c4a2.web.app`
- Alternate URL: `https://internal-technical-audit-3c4a2.firebaseapp.com`

## Option A: Automatic Setup via Firebase CLI (Recommended - 1 Minute)
Run these commands in your project folder after downloading the code:

```bash
npm install
npx firebase login
npx firebase init hosting:github
```
When prompted:
1. Select existing project: **`internal-technical-audit-3c4a2`**
2. Public directory: **`dist`** (already set in `firebase.json`)
3. Configure as single-page app? **`Yes`**
4. Set up automatic builds and deploys with GitHub? **`Yes`**
5. Enter your GitHub `username/repo`
6. When asked to overwrite `.github/workflows/...`, choose **`No`** (already pre-configured!).

From then on, **every `git push` to `main` or `master`** automatically builds and deploys to `https://internal-technical-audit-3c4a2.web.app`.

## Option B: Manual GitHub Secret Setup (If pushing directly on GitHub Web)
1. Open [Firebase Console](https://console.firebase.google.com/project/internal-technical-audit-3c4a2/settings/serviceaccounts/adminsdk) -> **Project Settings -> Service Accounts** -> click **Generate new private key** (downloads a `.json` file).
   *(Or in Google Cloud IAM, grant a service account `Firebase Hosting Admin` role and export JSON key.)*
2. Open your GitHub repository -> **Settings -> Secrets and variables -> Actions -> New repository secret**.
3. Create secret named:
   - Name: `FIREBASE_SERVICE_ACCOUNT_INTERNAL_TECHNICAL_AUDIT_3C4A2` (or `FIREBASE_SERVICE_ACCOUNT`)
   - Value: Paste the entire contents of the `.json` key file.
4. Push code to `main` (or open **Actions -> Deploy to Firebase Hosting on Merge -> Run workflow**).

## Option C: Manual Instant Deploy from PC
```bash
npm install
npx firebase login
npm run deploy:firebase
```
