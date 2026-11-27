# Firebase Hosting (`web.app`) + GitHub Auto-Deploy Guide

This project is configured exclusively for **Firebase Hosting** (`https://garments-technical-audit.web.app`) with **GitHub Actions** automatic deployment.

## Live App URL
- **Primary URL**: `https://garments-technical-audit.web.app`
- **Alternate URL**: `https://garments-technical-audit.firebaseapp.com`

---

## Step 1: Connect GitHub to Firebase Hosting (`web.app`)

### Method A: 1-Minute Setup via Terminal (Recommended)
After uploading/pushing your code to GitHub, run these commands in the project folder:

```bash
npm install
npx firebase login
npx firebase init hosting:github
```
When asked:
1. Select existing project -> **`garments-technical-audit`**
2. Public directory -> **`dist`**
3. Configure as single-page app -> **`Yes`**
4. Set up automatic builds and deploys with GitHub -> **`Yes`**
5. Enter your GitHub repository (e.g., `sabuj1993/INTERNAL-TECHNICAL-AUDIT`)
6. Overwrite `.github/workflows/...`? -> **`No`** (already configured!)

### Method B: Manual Setup via GitHub Repository Settings
1. Open [Firebase Console Service Accounts](https://console.firebase.google.com/project/garments-technical-audit/settings/serviceaccounts/adminsdk) -> click **Generate new private key** (downloads a `.json` file).
2. Open your GitHub repository -> **Settings -> Secrets and variables -> Actions -> New repository secret**.
3. Add secret:
   - **Name**: `FIREBASE_SERVICE_ACCOUNT_GARMENTS_TECHNICAL_AUDIT` (or `FIREBASE_SERVICE_ACCOUNT`)
   - **Value**: Paste the full contents of the downloaded `.json` key file.
4. Push to `main` (or go to **Actions -> Deploy to Firebase Hosting on Merge -> Run workflow**).

---

## Step 2: Manual Direct Deploy (Without Waiting for GitHub Actions)
```bash
npm install
npx firebase login
npm run deploy:firebase
```
Your app will immediately go live on **`https://garments-technical-audit.web.app`**.
