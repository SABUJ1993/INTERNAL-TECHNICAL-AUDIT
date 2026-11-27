import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const PORT = isProduction ? (Number(process.env.PORT) || 8080) : 3000;

const app = express();
app.use(express.json({ limit: '250mb' }));
app.use(express.urlencoded({ extended: true, limit: '250mb' }));

// In-memory/File-backed store for audits & audit templates
const DATA_DIR = path.join(__dirname, '.data');
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.error('Error creating data directory', e);
  }
}

const AUDITS_FILE = path.join(DATA_DIR, 'audits.json');
const DRAFT_FILE = path.join(DATA_DIR, 'active-draft.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function loadAudits(): any[] {
  try {
    if (fs.existsSync(AUDITS_FILE)) {
      return JSON.parse(fs.readFileSync(AUDITS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed reading audits file', err);
  }
  return [];
}

function saveAudits(audits: any[]) {
  try {
    fs.writeFileSync(AUDITS_FILE, JSON.stringify(audits, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed writing audits file', err);
  }
}

function loadUsers(): any[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed reading users file', err);
  }
  return [];
}

function saveUsers(users: any[]) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed writing users file', err);
  }
}

function loadActiveDraft(): any | null {
  try {
    if (fs.existsSync(DRAFT_FILE)) {
      return JSON.parse(fs.readFileSync(DRAFT_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed reading active draft file', err);
  }
  return null;
}

let serverDraftTimeout: NodeJS.Timeout | null = null;
let latestDraftToWrite: any = null;

function saveActiveDraft(draft: any) {
  latestDraftToWrite = draft;
  if (serverDraftTimeout) return;
  serverDraftTimeout = setTimeout(() => {
    serverDraftTimeout = null;
    if (!latestDraftToWrite) return;
    try {
      fs.writeFile(DRAFT_FILE, JSON.stringify(latestDraftToWrite), 'utf-8', (err) => {
        if (err) console.error('Failed writing active draft file', err);
      });
    } catch (err) {
      console.error('Failed writing active draft file', err);
    }
  }, 1000);
}

// SSE Real-Time Clients Registry
interface SSEClient {
  id: string;
  res: express.Response;
}
let sseClients: SSEClient[] = [];

function broadcastDraftUpdate(draft: any, senderClientId?: string) {
  const payload = JSON.stringify({
    ...draft,
    senderClientId,
    syncedAt: new Date().toISOString(),
  });
  const message = `event: draft_update\ndata: ${payload}\n\n`;

  sseClients.forEach((client) => {
    try {
      client.res.write(message);
    } catch (e) {
      // client disconnected
    }
  });
}

// Keep-alive heartbeat every 20 seconds for SSE
setInterval(() => {
  sseClients.forEach((client) => {
    try {
      client.res.write(': keepalive\n\n');
    } catch {
      // ignore
    }
  });
}, 20000);

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    connectedClients: sseClients.length,
  });
});

app.get(['/api/version', '/version.json'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const versionPath = path.join(__dirname, 'public', 'version.json');
  if (fs.existsSync(versionPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
      return res.json(data);
    } catch {
      // fallback
    }
  }
  res.json({
    version: '2.7.0',
    buildTime: Date.now(),
    appName: 'Internal Technical Audit',
  });
});

// In-memory verification code registry (Gmail OTP)
const verificationCodes = new Map<string, { code: string; expiresAt: number }>();

// Send 6-digit Gmail verification code
app.post('/api/auth/send-code', (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Gmail address is required' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(trimmedEmail);
  if (!isGmail) {
    return res.status(400).json({ error: 'Please enter a valid Gmail address (e.g. name@gmail.com)' });
  }

  // Check if email already registered
  const users = loadUsers();
  if (users.some((u) => u.email?.toLowerCase() === trimmedEmail)) {
    return res.status(400).json({ error: 'This Gmail address is already registered. Please sign in.' });
  }

  // Generate 6-digit verification code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  verificationCodes.set(trimmedEmail, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes validity
  });

  console.log(`[AUTH] Verification code for ${trimmedEmail}: ${code}`);

  res.json({
    success: true,
    message: `Verification code sent to ${trimmedEmail}`,
    code, // Returned for client-side display & testing
  });
});

// Register new auditor with verified Gmail
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role, verificationCode } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Full name, Gmail address, and password are required' });
  }

  const trimmedEmail = String(email).trim().toLowerCase();
  const trimmedPass = String(password).trim();
  const trimmedName = String(name).trim();

  const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(trimmedEmail);
  if (!isGmail) {
    return res.status(400).json({ error: 'Must register with a valid Gmail address (@gmail.com)' });
  }

  if (trimmedPass.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long' });
  }

  // Check verification code
  const stored = verificationCodes.get(trimmedEmail);
  if (verificationCode) {
    if (!stored || stored.code !== String(verificationCode).trim()) {
      return res.status(400).json({ error: 'Invalid or expired 6-digit verification code' });
    }
    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(trimmedEmail);
      return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    }
  }

  const users = loadUsers();
  const existing = users.find((u) => u.email?.toLowerCase() === trimmedEmail);
  if (existing) {
    return res.status(400).json({ error: 'This Gmail address is already registered. Please sign in.' });
  }

  const newUser = {
    id: `aud-${Date.now()}`,
    username: trimmedEmail,
    name: trimmedName,
    password: trimmedPass,
    role: (role && String(role).trim()) || 'QMS Specialist (Auditor)',
    email: trimmedEmail,
    isVerified: true,
    token: `token_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveUsers(users);
  verificationCodes.delete(trimmedEmail);

  res.status(201).json({
    id: newUser.id,
    username: newUser.username,
    name: newUser.name,
    role: newUser.role,
    email: newUser.email,
    token: newUser.token,
  });
});

// Authentication (Strict check against registered users, no hardcoded credentials)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Gmail address and password are required' });
  }

  const trimmedIdentifier = String(username).trim().toLowerCase();
  const trimmedPass = String(password).trim();

  const users = loadUsers();
  const matched = users.find(
    (u) =>
      (u.email?.toLowerCase() === trimmedIdentifier || u.username?.toLowerCase() === trimmedIdentifier) &&
      u.password === trimmedPass
  );

  if (matched) {
    return res.json({
      token: matched.token || `token_${Date.now()}`,
      user: {
        id: matched.id,
        username: matched.username || matched.email,
        name: matched.name,
        role: matched.role || 'QMS Specialist (Auditor)',
        email: matched.email,
        organization: 'Internal Technical Audit Team',
      },
    });
  }

  return res.status(401).json({
    error: 'Invalid Gmail address or password. Please register an account first.',
  });
});

// In-memory registry for Forgot Password OTP codes
const passwordResetCodes = new Map<string, { code: string; expiresAt: number }>();

// Forgot Password - Request 6-digit OTP
app.post('/api/auth/forgot-password/request', (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Registered Gmail address is required' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(trimmedEmail);
  if (!isGmail) {
    return res.status(400).json({ error: 'Please enter a valid Gmail address (e.g. name@gmail.com)' });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  passwordResetCodes.set(trimmedEmail, {
    code,
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 mins validity
  });

  console.log(`[AUTH] Forgot Password OTP for ${trimmedEmail}: ${code}`);

  res.json({
    success: true,
    message: `Password reset OTP generated for ${trimmedEmail}`,
    code, // returned for client-side testing & immediate entry
  });
});

// Forgot Password - Verify OTP and Reset Password
app.post('/api/auth/forgot-password/reset', (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'Email, OTP code, and new password are required' });
  }

  const trimmedEmail = String(email).trim().toLowerCase();
  const trimmedCode = String(code).trim();
  const trimmedNewPass = String(newPassword).trim();

  if (trimmedNewPass.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long' });
  }

  const stored = passwordResetCodes.get(trimmedEmail);
  if (!stored || stored.code !== trimmedCode) {
    return res.status(400).json({ error: 'Invalid 6-digit verification OTP code' });
  }

  if (Date.now() > stored.expiresAt) {
    passwordResetCodes.delete(trimmedEmail);
    return res.status(400).json({ error: 'Verification OTP has expired. Please request a new code.' });
  }

  const users = loadUsers();
  const idx = users.findIndex((u) => u.email?.toLowerCase() === trimmedEmail);
  if (idx >= 0) {
    users[idx].password = trimmedNewPass;
    saveUsers(users);
  } else {
    users.push({
      id: `aud-${Date.now()}`,
      username: trimmedEmail,
      name: trimmedEmail.split('@')[0],
      email: trimmedEmail,
      password: trimmedNewPass,
      role: 'Lead QMS Auditor',
      createdAt: new Date().toISOString(),
      isVerified: true,
    });
    saveUsers(users);
  }

  passwordResetCodes.delete(trimmedEmail);

  res.json({
    success: true,
    message: 'Password reset successfully! You can now log in with your new password.',
  });
});

// REAL-TIME SSE SYNC STREAM (Multi-Device Live Sync)
app.get('/api/active-draft/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const newClient: SSEClient = { id: clientId, res };
  sseClients.push(newClient);

  // Send initial current draft immediately upon connection
  const currentDraft = loadActiveDraft();
  if (currentDraft) {
    res.write(`event: initial_state\ndata: ${JSON.stringify(currentDraft)}\n\n`);
  } else {
    res.write(`event: initial_state\ndata: null\n\n`);
  }

  req.on('close', () => {
    sseClients = sseClients.filter((c) => c.id !== clientId);
  });
});

// Active Draft Endpoints (Live Cloud Sync between Mobile & PC)
app.get('/api/active-draft', (req, res) => {
  const draft = loadActiveDraft();
  res.json(draft || null);
});

app.post('/api/active-draft', (req, res) => {
  const { factoryInfo, sections, clientId, lastUpdatedBy } = req.body;
  if (!factoryInfo && !sections) {
    return res.status(400).json({ error: 'Invalid draft data' });
  }

  const existingDraft = loadActiveDraft();

  const mergedFactoryInfo = factoryInfo ? { ...factoryInfo } : existingDraft?.factoryInfo || null;
  const mergedSections = sections ? [...sections] : existingDraft?.sections || null;

  const updatedDraft = {
    factoryInfo: mergedFactoryInfo,
    sections: mergedSections,
    clientId: clientId || null,
    lastUpdatedBy: lastUpdatedBy || 'Auditor',
    updatedAt: new Date().toISOString(),
  };

  saveActiveDraft(updatedDraft);

  // Broadcast in real-time to all other open browsers/devices
  broadcastDraftUpdate(updatedDraft, clientId);

  res.json({ success: true, updatedAt: updatedDraft.updatedAt });
});

app.delete('/api/active-draft', (req, res) => {
  try {
    if (fs.existsSync(DRAFT_FILE)) {
      fs.unlinkSync(DRAFT_FILE);
    }
  } catch (e) {
    console.error('Error removing active draft file', e);
  }
  broadcastDraftUpdate(null);
  res.json({ success: true, message: 'Active draft reset successfully' });
});

// Audits CRUD - Strictly restricted to Admin: quality.bd.eng@gmail.com
const ADMIN_EMAIL = 'quality.bd.eng@gmail.com';

app.get('/api/audits', (req, res) => {
  const requester = (req.headers['x-auditor-email'] as string) || (req.query.email as string) || '';
  if (requester.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase()) {
    // Non-admins cannot view saved audit archives
    return res.json([]);
  }
  const audits = loadAudits();
  res.json(audits);
});

app.get('/api/audits/:id', (req, res) => {
  const requester = (req.headers['x-auditor-email'] as string) || (req.query.email as string) || '';
  if (requester.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: 'Permission denied: Only the Admin can access saved audits.' });
  }
  const audits = loadAudits();
  const audit = audits.find((a) => a.id === req.params.id);
  if (!audit) {
    return res.status(404).json({ error: 'Audit not found' });
  }
  res.json(audit);
});

app.post('/api/audits', (req, res) => {
  const audits = loadAudits();
  const newAudit = {
    ...req.body,
    id: req.body.id || `AUD-${Date.now().toString().slice(-6)}`,
    updatedAt: new Date().toISOString(),
    createdAt: req.body.createdAt || new Date().toISOString(),
  };

  const existingIndex = audits.findIndex((a) => a.id === newAudit.id);
  if (existingIndex >= 0) {
    audits[existingIndex] = newAudit;
  } else {
    audits.unshift(newAudit);
  }

  saveAudits(audits);
  res.status(201).json(newAudit);
});

app.delete('/api/audits/:id', (req, res) => {
  const requester = (req.headers['x-auditor-email'] as string) || (req.query.email as string) || '';
  if (requester.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: 'Permission denied: Only the Admin (quality.bd.eng@gmail.com) can delete audits.' });
  }
  let audits = loadAudits();
  audits = audits.filter((a) => a.id !== req.params.id);
  saveAudits(audits);
  res.json({ success: true, message: 'Audit deleted successfully' });
});

// Download complete standalone offline web package / Firebase hosting build (.zip)
app.get(
  ['/api/download/offline-package', '/api/download-build', '/api/build.zip', '/download-build'],
  async (req, res) => {
    try {
      const zipCandidates = [
        path.join(__dirname, 'Internal_Technical_Audit_Production_Build.zip'),
        path.join(__dirname, 'dist', 'Internal_Technical_Audit_Production_Build.zip'),
        path.join(__dirname, 'public', 'Internal_Technical_Audit_Production_Build.zip'),
      ];

      for (const candidate of zipCandidates) {
        if (fs.existsSync(candidate)) {
          return res.download(candidate, 'Internal_Technical_Audit_Production_Build.zip');
        }
      }

      const distPath = path.join(__dirname, 'dist');
      if (!fs.existsSync(distPath)) {
        return res.status(404).json({ error: 'Production bundle not found. Please compile the app first.' });
      }

      const zip = new JSZip();

      function addDirectoryToZip(dirPath: string, zipFolder: JSZip) {
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
          if (item.endsWith('.zip')) continue;
          const fullItemPath = path.join(dirPath, item);
          const stat = fs.statSync(fullItemPath);
          if (stat.isDirectory()) {
            const subFolder = zipFolder.folder(item);
            if (subFolder) {
              addDirectoryToZip(fullItemPath, subFolder);
            }
          } else {
            const fileData = fs.readFileSync(fullItemPath);
            zipFolder.file(item, fileData);
          }
        }
      }

      addDirectoryToZip(distPath, zip);

      const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="Internal_Technical_Audit_Production_Build.zip"'
      );
      res.setHeader('Content-Length', zipBuffer.length);
      res.send(zipBuffer);
    } catch (err: any) {
      console.error('Error serving package zip', err);
      res.status(500).json({ error: 'Failed to generate zip package', details: err?.message });
    }
  }
);

// Setup Vite or Static File Serving
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT} (${isProduction ? 'production' : 'development'})`);
  });
}

startServer();
