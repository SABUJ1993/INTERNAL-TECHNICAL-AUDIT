import React, { useState, useEffect } from 'react';
import {
  Lock,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  KeyRound,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';
import {
  loginAuditor,
  registerAuditor,
  sendGmailVerificationCode,
  requestForgotPasswordOtp,
  resetAuditorPassword,
} from '../services/api';
import { AuditorUser } from '../types/audit';

interface Props {
  onLoginSuccess: (user: AuditorUser) => void;
}

export const LoginScreen: React.FC<Props> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot-password'>('login');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Register form state
  const [regFullName, setRegFullName] = useState('');
  const [regRole, setRegRole] = useState('Lead QMS Auditor');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [verificationStep, setVerificationStep] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [sentCode, setSentCode] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStep, setForgotStep] = useState<'request' | 'verify'>('request');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotSentOtp, setForgotSentOtp] = useState('');
  const [forgotNewPass, setForgotNewPass] = useState('');
  const [forgotConfirmPass, setForgotConfirmPass] = useState('');
  const [showForgotPass, setShowForgotPass] = useState(false);
  const [forgotOtpCopied, setForgotOtpCopied] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Always start with clean blank credentials so shared links never expose another user's email/password
  useEffect(() => {
    try {
      localStorage.removeItem('saved_auditor_credentials');
    } catch {
      // ignore
    }
  }, []);

  // Validate email format
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setError('Please enter your User Email and password.');
      return;
    }

    if (!isValidEmail(loginEmail)) {
      setError('Please enter a valid email address (e.g. user@mail.com).');
      return;
    }

    try {
      setLoading(true);
      const user = await loginAuditor(loginEmail.trim(), loginPassword.trim());

      setSuccessMessage('Login successful! Opening Audit Suite...');
      setTimeout(() => {
        onLoginSuccess(user);
      }, 200);
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify credentials or register.');
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Send registration verification code
  const handleRequestVerificationCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!regFullName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setError('Please provide Full Name, User Email, and Password.');
      return;
    }

    if (!isValidEmail(regEmail)) {
      setError('Registration requires a valid email address (e.g. name@gmail.com)');
      return;
    }

    if (regPassword.trim().length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    try {
      setLoading(true);
      const result = await sendGmailVerificationCode(regEmail.trim());
      setSentCode(result.code || '');
      setVerificationStep(true);
      setSuccessMessage(
        `Verification code generated for ${regEmail.trim()}. Enter the 6-digit code below to complete registration.`
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch verification code. Please check your email.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Confirm registration with verification code
  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!verificationCode.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    try {
      setLoading(true);
      const user = await registerAuditor({
        name: regFullName.trim(),
        email: regEmail.trim(),
        password: regPassword.trim(),
        role: regRole.trim(),
        verificationCode: verificationCode.trim(),
      });

      setSuccessMessage('Account verified & registered successfully! Launching audit suite...');
      setTimeout(() => {
        onLoginSuccess(user);
      }, 300);
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Incorrect or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password Step 1: Request OTP
  const handleForgotRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!forgotEmail.trim()) {
      setError('Please enter your registered Gmail address.');
      return;
    }

    if (!isValidEmail(forgotEmail)) {
      setError('Please enter a valid Gmail address (e.g. name@gmail.com).');
      return;
    }

    try {
      setLoading(true);
      const result = await requestForgotPasswordOtp(forgotEmail.trim());
      setForgotSentOtp(result.code || '');
      setForgotStep('verify');
      setSuccessMessage(
        `Verification code sent to ${forgotEmail.trim()}. Enter the 6-digit OTP and your new password below.`
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to generate password reset code. Please check your email address.');
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password Step 2: Verify OTP & Set New Password
  const handleForgotResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!forgotOtp.trim()) {
      setError('Please enter the 6-digit verification OTP.');
      return;
    }

    if (forgotNewPass.trim().length < 4) {
      setError('New password must be at least 4 characters long.');
      return;
    }

    if (forgotNewPass.trim() !== forgotConfirmPass.trim()) {
      setError('Passwords do not match. Please verify both password fields.');
      return;
    }

    try {
      setLoading(true);
      await resetAuditorPassword(forgotEmail.trim(), forgotOtp.trim(), forgotNewPass.trim());

      setSuccessMessage('Password reset successfully! Logging you in...');

      // Auto login with new password
      const user = await loginAuditor(forgotEmail.trim(), forgotNewPass.trim());
      setTimeout(() => {
        onLoginSuccess(user);
      }, 300);
    } catch (err: any) {
      setError(err?.message || 'Password reset failed. Invalid or expired OTP code.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (sentCode) {
      navigator.clipboard.writeText(sentCode);
      setVerificationCode(sentCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    }
  };

  const handleCopyForgotOtp = () => {
    if (forgotSentOtp) {
      navigator.clipboard.writeText(forgotSentOtp);
      setForgotOtp(forgotSentOtp);
      setForgotOtpCopied(true);
      setTimeout(() => setForgotOtpCopied(false), 2500);
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <div
      className="min-h-screen w-full relative flex flex-col justify-between p-4 sm:p-8 lg:p-12 bg-slate-900 bg-cover bg-center bg-no-repeat overflow-x-hidden"
      style={{
        backgroundImage: `linear-gradient(to right, rgba(15, 23, 42, 0.40) 0%, rgba(15, 23, 42, 0.22) 50%, rgba(15, 23, 42, 0.35) 100%), url('${import.meta.env.BASE_URL}assets/aistudio/image_9e8b2608.png')`,
      }}
    >
      {/* Light subtle backdrop overlay to ensure bright background and perfect text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-slate-950/20 pointer-events-none" />

      {/* Main Container: Split 2-column layout on Desktop (Branding Left, Login Card Right), Stacked on Mobile */}
      <div className="relative z-10 w-full max-w-[1600px] mx-auto flex-1 flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-14 my-auto py-4 sm:py-6">
        {/* LEFT COLUMN: Large Prominent Title, Branding, "Developed by Sabuj Mahmud" and Dynamic Copyright */}
        <div className="w-full lg:max-w-xl xl:max-w-2xl text-left space-y-4 sm:space-y-6">
          {/* Logo & Tag Badge */}
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}app-icon.png`}
              alt="Internal Technical Audit Logo"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl shadow-xl border-2 border-white/80 ring-4 ring-blue-500/25 object-cover shrink-0"
            />
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-600/35 border border-blue-300/40 text-blue-100 text-xs font-bold tracking-wide backdrop-blur-md">
              <ShieldCheck className="w-4 h-4 text-blue-300 shrink-0" />
              <span>QMS Professional Audit Platform</span>
            </div>
          </div>

          {/* Title: Internal Technical Audit - Larger & Beautifully Designed */}
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl md:text-5xl xl:text-6xl font-black text-white tracking-tight leading-[1.1] drop-shadow-[0_3px_8px_rgba(0,0,0,0.85)]">
              Internal Technical Audit
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-slate-100 font-medium leading-relaxed drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] max-w-xl">
              Garments Technical Audit &amp; Quality Management System
            </p>
          </div>

          {/* Value Badges / Highlights */}
          <div className="grid grid-cols-2 gap-2.5 pt-1 max-w-md">
            <div className="bg-slate-900/40 backdrop-blur-md border border-white/20 rounded-xl p-2.5 text-white/95 text-xs font-semibold flex items-center gap-2 drop-shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm" />
              <span>35 Core Checkpoints</span>
            </div>
            <div className="bg-slate-900/40 backdrop-blur-md border border-white/20 rounded-xl p-2.5 text-white/95 text-xs font-semibold flex items-center gap-2 drop-shadow-sm">
              <span className="w-2 h-2 rounded-full bg-blue-400 shadow-sm" />
              <span>Instant Scoring &amp; PDF</span>
            </div>
            <div className="bg-slate-900/40 backdrop-blur-md border border-white/20 rounded-xl p-2.5 text-white/95 text-xs font-semibold flex items-center gap-2 drop-shadow-sm">
              <span className="w-2 h-2 rounded-full bg-indigo-400 shadow-sm" />
              <span>Multi-Device Live Sync</span>
            </div>
            <div className="bg-slate-900/40 backdrop-blur-md border border-white/20 rounded-xl p-2.5 text-white/95 text-xs font-semibold flex items-center gap-2 drop-shadow-sm">
              <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm" />
              <span>ISO 9001 Compliance</span>
            </div>
          </div>

          {/* Developer Credit & Dynamic Year Copyright on the Left Side */}
          <div className="pt-4 border-t border-white/25 space-y-1">
            <p className="text-sm sm:text-base font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              Developed by Sabuj Mahmud
            </p>
            <p className="text-xs sm:text-sm text-slate-200 font-medium tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              &copy; {currentYear} All Rights Reserved
            </p>
          </div>
        </div>

        {/* RIGHT COLUMN: Off-White Login Option Container */}
        <div className="w-full sm:max-w-[420px] bg-slate-50/95 sm:bg-white/95 rounded-3xl border border-white/70 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5),0_0_35px_rgba(255,255,255,0.2)] p-5 sm:p-7 relative z-10 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 shrink-0">
          {/* Card Header */}
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center gap-2 mb-1.5">
              <span className="p-1.5 rounded-xl bg-blue-100 text-blue-700">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
              </span>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                {mode === 'login' ? 'Auditor Sign In' : mode === 'register' ? 'Auditor Registration' : 'Reset Password'}
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {mode === 'login'
                ? 'Enter credentials to open technical audit suite'
                : mode === 'register'
                ? 'Create a verified auditor account'
                : 'Enter email to receive password reset OTP'}
            </p>
          </div>

        {/* Inner Off-White Form Area */}
        <div className="bg-white/90 border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
          {/* Feedback Alerts */}
          {error && (
            <div className="mb-3.5 p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span className="leading-tight font-medium">{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-3.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="leading-tight font-medium">{successMessage}</span>
            </div>
          )}

          {/* 1. LOGIN FORM */}
          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} autoComplete="off" className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  User Email <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="email"
                    name="auditor_email_input"
                    autoComplete="off"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="user@mail.com"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-all font-mono"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="auditor_password_input"
                    autoComplete="new-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter account password"
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Inline Row: Remember on Left, Forgot Password? on Right */}
              <div className="flex items-center justify-between pt-0.5 select-none text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                  />
                  <span className="text-slate-700 font-semibold">Remember</span>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot-password');
                    setForgotStep('request');
                    setForgotEmail(loginEmail.trim());
                    setError('');
                    setSuccessMessage('');
                  }}
                  className="font-bold text-blue-600 hover:text-blue-700 hover:underline transition-colors cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 active:scale-[0.99] mt-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Sign In &amp; Open Audit</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Bottom Switch to Register */}
              <div className="pt-3 text-center text-xs text-slate-500 border-t border-slate-100">
                <span>New auditor or device? </span>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError('');
                    setSuccessMessage('');
                  }}
                  className="text-blue-600 hover:text-blue-700 font-bold underline cursor-pointer ml-1"
                >
                  Register / Sign Up
                </button>
              </div>
            </form>
          ) : mode === 'forgot-password' ? (
            /* 2. FORGOT PASSWORD FLOW */
            <div className="space-y-3.5">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                <div className="flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-900">Reset Password</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setSuccessMessage('');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </button>
              </div>

              {forgotStep === 'request' ? (
                /* Step 1: Enter email for OTP */
                <form onSubmit={handleForgotRequestOtp} className="space-y-3">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Enter your registered Gmail address. A 6-digit OTP will be dispatched to verify your identity.
                  </p>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Registered Gmail Address <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="e.g. user@mail.com"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 font-mono"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Send Verification OTP</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Step 2: Enter OTP + New Password */
                <form onSubmit={handleForgotResetPassword} className="space-y-3">
                  {forgotSentOtp && (
                    <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs space-y-1">
                      <div className="font-bold text-blue-900 flex items-center justify-between text-[11px]">
                        <span>Your Verification OTP:</span>
                        <span className="text-[10px] text-blue-700">Valid 15m</span>
                      </div>
                      <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-blue-200">
                        <span className="font-mono text-base font-black tracking-widest text-blue-700">
                          {forgotSentOtp}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyForgotOtp}
                          className="flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-100/70 px-2 py-0.5 rounded cursor-pointer transition-colors"
                        >
                          {forgotOtpCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{forgotOtpCopied ? 'Inserted!' : 'Insert Code'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Enter 6-Digit OTP <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full text-center py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono tracking-widest text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                      required
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      New Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type={showForgotPass ? 'text' : 'password'}
                        value={forgotNewPass}
                        onChange={(e) => setForgotNewPass(e.target.value)}
                        placeholder="Min 4 characters"
                        className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowForgotPass(!showForgotPass)}
                        className="absolute right-2.5 top-2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        {showForgotPass ? <EyeOff className="w-3.5 h-3.5 text-blue-600" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Confirm New Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type={showForgotPass ? 'text' : 'password'}
                        value={forgotConfirmPass}
                        onChange={(e) => setForgotConfirmPass(e.target.value)}
                        placeholder="Re-type new password"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 mt-1"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Update Password &amp; Login</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          ) : verificationStep ? (
            /* 3. REGISTRATION STEP 2: VERIFICATION CODE ENTRY */
            <form onSubmit={handleCompleteRegistration} className="space-y-3">
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs space-y-1">
                <div className="font-bold text-blue-900 flex items-center justify-between text-[11px]">
                  <span>6-Digit Verification Code</span>
                  <span className="text-[10px] text-blue-700 font-semibold">Active</span>
                </div>
                <p className="text-xs text-slate-700">
                  Dispatched to <strong className="text-slate-900 font-mono">{regEmail}</strong>
                </p>

                {sentCode && (
                  <div className="mt-1.5 flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-blue-200">
                    <span className="font-mono text-base font-black tracking-widest text-blue-700">
                      {sentCode}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-100/70 px-2 py-0.5 rounded cursor-pointer transition-colors"
                    >
                      {codeCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{codeCopied ? 'Inserted!' : 'Auto-Fill'}</span>
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Enter Verification Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full text-center py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono tracking-widest text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Verify &amp; Create Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-2 text-center text-xs text-slate-500">
                <button
                  type="button"
                  onClick={() => {
                    setVerificationStep(false);
                    setError('');
                  }}
                  className="text-blue-600 hover:underline cursor-pointer font-semibold"
                >
                  ← Edit Details / Try Again
                </button>
              </div>
            </form>
          ) : (
            /* 4. REGISTRATION STEP 1: INITIAL DETAILS */
            <form onSubmit={handleRequestVerificationCode} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                  placeholder="e.g. Sabuj Mahmud"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Auditor Role / Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value)}
                  placeholder="e.g. Lead QMS Auditor"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Gmail Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="e.g. auditor@gmail.com"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Choose Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Min 4 characters"
                    className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-2.5 top-2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showRegPassword ? <EyeOff className="w-3.5 h-3.5 text-blue-600" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 mt-1"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-2 text-center text-xs text-slate-500 border-t border-slate-100">
                <span>Already registered? </span>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setSuccessMessage('');
                  }}
                  className="text-blue-600 hover:text-blue-700 font-bold underline cursor-pointer ml-1"
                >
                  Auditor Sign In
                </button>
              </div>
            </form>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};
