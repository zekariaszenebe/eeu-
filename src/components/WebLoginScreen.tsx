import React, { useState, useEffect } from 'react';
import { 
  Lock, User, Eye, EyeOff, AlertCircle, ArrowRight, Headphones, Shield, 
  HelpCircle, Check, Zap, Users, ShieldCheck, PhoneCall, Info
} from 'lucide-react';
import EEULogo from './EEULogo';
import ThemeToggle from './ThemeToggle';
import { UserRole, TeamLeaderUser } from '../types';

interface WebLoginScreenProps {
  onLoginSuccess: (role: UserRole, teamLeader?: TeamLeaderUser) => void;
  teamLeaders?: TeamLeaderUser[];
}

export default function WebLoginScreen({ onLoginSuccess, teamLeaders = [] }: WebLoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Load saved credentials if 'remember me' is checked
  useEffect(() => {
    const savedRemember = localStorage.getItem('eeu_remember_me') === 'true';
    setRememberMe(savedRemember);
    if (savedRemember) {
      const savedUser = localStorage.getItem('eeu_saved_username') || '';
      const savedPass = localStorage.getItem('eeu_saved_password') || '';
      setUsername(savedUser);
      setPassword(savedPass);
    }
  }, []);

  const processLogin = (targetUser: string, targetPass: string) => {
    setError('');

    if (!targetUser.trim() || !targetPass) {
      setError('Please enter your Employee ID / Username and Password.');
      return;
    }

    setIsSubmitting(true);

    // Normalize user input to compare flexibly with or without leading '@'
    const rawUser = targetUser.trim().toLowerCase();
    const strippedUser = rawUser.startsWith('@') ? rawUser.substring(1) : rawUser;
    const withAtUser = rawUser.startsWith('@') ? rawUser : `@${rawUser}`;

    setTimeout(() => {
      // Prompt Google Password Manager / Browser Credential Store if supported
      if (typeof window !== 'undefined' && 'PasswordCredential' in window && (window as any).PasswordCredential) {
        try {
          const cred = new (window as any).PasswordCredential({
            id: targetUser,
            password: targetPass,
            name: targetUser
          });
          if (navigator.credentials && navigator.credentials.store) {
            navigator.credentials.store(cred).catch(() => {});
          }
        } catch {
          // Silent fallback if browser credential store restrictions apply
        }
      }

      // 1. Check if Admin
      if ((strippedUser === 'admin' || withAtUser === '@admin') && (targetPass === '@zeki2121' || targetPass === 'zeki2121')) {
        saveCredentials(targetUser, targetPass);
        onLoginSuccess('admin');
        return;
      }

      // 2. Check registered Team Leaders in database
      const matchedTL = teamLeaders.find((tl) => {
        const tlUser = tl.username.trim().toLowerCase();
        const tlStripped = tlUser.startsWith('@') ? tlUser.substring(1) : tlUser;
        return (tlUser === rawUser || tlUser === withAtUser || tlStripped === strippedUser) && tl.password === targetPass;
      });

      if (matchedTL) {
        saveCredentials(targetUser, targetPass);
        onLoginSuccess('team_leader', matchedTL);
        return;
      }

      // Default hardcoded Team Leader fallback (Teams A, B, C, D and named Team Leaders like Zekarias Zenebe)
      if (
        (strippedUser === 'teamleader' || strippedUser === 'tl' || strippedUser === 'team_a' || strippedUser === 'team_b' || strippedUser === 'team_c' || strippedUser === 'team_d' || strippedUser === 'teama' || strippedUser === 'teamb' || strippedUser === 'teamc' || strippedUser === 'teamd' || strippedUser === 'zekarias' || strippedUser === 'zekariaszenebe' || strippedUser === 'zekarias_zenebe' || strippedUser === 'zenebe') && 
        (targetPass === 'Tl@1234' || targetPass === 'Eeu@1234')
      ) {
        let teamName = 'Team A Leader';
        let districtName = 'Team A';
        if (strippedUser === 'team_b' || strippedUser === 'teamb') {
          teamName = 'Team B Leader';
          districtName = 'Team B';
        }
        if (strippedUser === 'team_c' || strippedUser === 'teamc') {
          teamName = 'Team C Leader';
          districtName = 'Team C';
        }
        if (strippedUser === 'team_d' || strippedUser === 'teamd') {
          teamName = 'Team D Leader';
          districtName = 'Team D';
        }
        if (strippedUser === 'zekarias' || strippedUser === 'zekariaszenebe' || strippedUser === 'zekarias_zenebe' || strippedUser === 'zenebe') {
          teamName = 'Zekarias Zenebe';
          districtName = 'Addis Ababa HQ';
        }
        saveCredentials(targetUser, targetPass);
        onLoginSuccess('team_leader', {
          id: 'hardcoded-tl-' + strippedUser,
          name: teamName,
          username: targetUser,
          district: districtName,
          password: targetPass,
          createdAt: new Date().toISOString()
        });
        return;
      }

      // 3. Check Call Agent login (Universal / default agent credentials)
      if (
        (strippedUser === 'contactcenter' || strippedUser === 'callcenter' || strippedUser === 'agent' || strippedUser === 'eeu' || strippedUser === 'operator') && 
        (targetPass === 'Eeu@1234' || targetPass === 'eeu1234' || targetPass === 'Call@1234')
      ) {
        saveCredentials(targetUser, targetPass);
        onLoginSuccess('agent');
        return;
      }

      // If user provided any non-empty credentials in development / demo mode, let them log in as agent
      if (targetUser.trim().length >= 3 && targetPass.length >= 4) {
        saveCredentials(targetUser, targetPass);
        onLoginSuccess('agent');
        return;
      }

      setError('Access Denied: Invalid credentials. Please check your username and password.');
      setIsSubmitting(false);
    }, 400);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processLogin(username, password);
  };

  const handleQuickContactCenterLogin = () => {
    if (isSubmitting) return;
    setUsername('contactcenter');
    setPassword('Eeu@1234');
    processLogin('contactcenter', 'Eeu@1234');
  };

  const saveCredentials = (userVal: string = username, passVal: string = password) => {
    if (rememberMe) {
      localStorage.setItem('eeu_remember_me', 'true');
      localStorage.setItem('eeu_saved_username', userVal);
      localStorage.setItem('eeu_saved_password', passVal);
    } else {
      localStorage.removeItem('eeu_remember_me');
      localStorage.removeItem('eeu_saved_username');
      localStorage.removeItem('eeu_saved_password');
    }
  };

  return (
    <div 
      className="min-h-screen w-full relative flex items-center justify-center p-4 sm:p-6 lg:p-12 select-none overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #16851D 0%, #1e8d26 15%, #2d942e 28%, #4f9c2d 42%, #839d22 56%, #b88f18 68%, #d8810b 80%, #ea8505 90%, #F28A00 100%)',
        minHeight: '100vh',
        width: '100%'
      }}
    >
      {/* Absolute Theme Toggle in Top Right */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle variant="dropdown" />
      </div>

      {/* Main Grid: Left Hero Branding + Right Elevated Login Card */}
      <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        
        {/* LEFT COLUMN: EEU Branding, Hero Typography & Trust Badges */}
        <div className="lg:col-span-6 flex flex-col justify-between text-left space-y-8 py-2 md:py-6">
          
          {/* Top Brand Header: Logo + Ethiopian Electric Utility */}
          <div className="flex items-center gap-3.5 h-[70.2656px]">
            <div className="w-14 h-14 shrink-0 rounded-full shadow-lg overflow-hidden flex items-center justify-center bg-white/15 backdrop-blur-md border border-white/30">
              <EEULogo size={56} showText={false} />
            </div>
            <div className="leading-tight">
              <div className="font-sans font-medium text-[#ffe1bc] text-[16px] tracking-wide drop-shadow-sm">
                የኢትዮጵያ ኤሌክትሪክ አገልግሎት
              </div>
              <div className="font-sans font-bold text-white text-[26px] leading-[32.5px] border-0 tracking-tight drop-shadow-md">
                Ethiopian Electric Utility
              </div>
            </div>
          </div>

          {/* Center Hero Heading & Slogan */}
          <div className="space-y-3 pt-4 sm:pt-8">
            <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-black text-white leading-[1.08] tracking-tight drop-shadow-md">
              Powering Ethiopia<br />
              Lighting the Future
            </h1>
            <p className="text-base sm:text-lg font-medium text-white/95 tracking-wide pt-1 drop-shadow-sm">
              Reliable. Sustainable. Together.
            </p>
          </div>

          {/* Bottom Feature Badges */}
          <div className="pt-6 sm:pt-10 grid grid-cols-3 gap-3 sm:gap-4 max-w-lg">
            <div className="flex items-center gap-2.5 sm:gap-3 text-white">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-white/40 bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 shadow-sm">
                <Headphones className="w-5 h-5 text-white stroke-[2]" />
              </div>
              <div className="leading-tight text-left">
                <span className="block text-xs sm:text-sm font-bold text-white leading-tight">Customer</span>
                <span className="block text-xs sm:text-sm font-medium text-white/85 leading-tight">Focused</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 sm:gap-3 text-white">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-white/40 bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 shadow-sm">
                <ShieldCheck className="w-5 h-5 text-white stroke-[2]" />
              </div>
              <div className="leading-tight text-left">
                <span className="block text-xs sm:text-sm font-bold text-white leading-tight">Reliable</span>
                <span className="block text-xs sm:text-sm font-medium text-white/85 leading-tight">Service</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 sm:gap-3 text-white">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-white/40 bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 shadow-sm">
                <Zap className="w-5 h-5 text-white stroke-[2.2]" />
              </div>
              <div className="leading-tight text-left">
                <span className="block text-xs sm:text-sm font-bold text-white leading-tight">Powering</span>
                <span className="block text-xs sm:text-sm font-medium text-white/85 leading-tight">Progress</span>
              </div>
            </div>
          </div>

          {/* Footer Help & Support Links */}
          <div className="pt-4 flex items-center gap-4 text-xs font-semibold text-white/90">
            <button 
              type="button" 
              onClick={() => setShowSupportModal(true)} 
              className="hover:text-white underline underline-offset-4 cursor-pointer transition-colors"
            >
              24/7 IT Support Desk
            </button>
            <span>•</span>
            <button 
              type="button" 
              onClick={() => setShowForgotModal(true)} 
              className="hover:text-white underline underline-offset-4 cursor-pointer transition-colors"
            >
              Forgot Password?
            </button>
            <span>•</span>
            <button 
              type="button" 
              onClick={() => setShowHelpModal(true)} 
              className="hover:text-white underline underline-offset-4 cursor-pointer transition-colors"
            >
              Help & Guide
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Elevated Modern EEU Call Center Login Card */}
        <div className="lg:col-span-6 flex justify-center lg:justify-end">
          <div 
            id="web-login-card"
            className="w-full max-w-[460px] bg-white dark:bg-slate-900 rounded-[28px] sm:rounded-[36px] shadow-2xl shadow-black/35 border border-white/80 dark:border-slate-800 p-7 sm:p-9 md:p-10 relative overflow-hidden transition-colors duration-200"
          >
            {/* Top Center Icon */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="relative mb-3 flex items-center justify-center">
                <svg className="w-16 h-16 text-[#0d4a2b] dark:text-[#5FA354]" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path 
                    d="M14 34 C14 20, 22 12, 32 12 C42 12, 50 20, 50 34" 
                    stroke="currentColor" 
                    strokeWidth="4" 
                    strokeLinecap="round" 
                  />
                  <rect x="9" y="30" width="8" height="15" rx="4" fill="currentColor" />
                  <rect x="47" y="30" width="8" height="15" rx="4" fill="currentColor" />
                  <path 
                    d="M48 41 C48 50, 42 54, 35 54" 
                    stroke="currentColor" 
                    strokeWidth="3.5" 
                    strokeLinecap="round" 
                  />
                  <circle cx="34" cy="54" r="2.5" fill="currentColor" />
                </svg>
              </div>

              <h2 className="text-2xl font-black text-[#0d4a2b] dark:text-white tracking-tight uppercase">
                EEU CONTACT CENTER
              </h2>
              <p className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 mt-0.5">
                Feeder Interruptions Dashboard For Call Center
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} method="post" action="#" className="space-y-4 text-left">
              {/* Username Input */}
              <div>
                <label htmlFor="login-username-input" className="block text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200 mb-1.5 font-sans">
                  Username
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400 dark:text-gray-500 pointer-events-none">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    id="login-username-input"
                    name="username"
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full pl-10 pr-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#0d4a2b] dark:focus:ring-[#5FA354] focus:border-transparent transition-all shadow-xs"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label htmlFor="login-password-input" className="block text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200 mb-1.5 font-sans">
                  Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400 dark:text-gray-500 pointer-events-none">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    id="login-password-input"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full pl-10 pr-11 py-2.5 sm:py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#0d4a2b] dark:focus:ring-[#5FA354] focus:border-transparent transition-all shadow-xs"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    id="login-toggle-password-btn"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isSubmitting}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 focus:outline-none cursor-pointer transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4.5 h-4.5 text-gray-500 dark:text-gray-400" />
                    ) : (
                      <Eye className="w-4.5 h-4.5 text-gray-500 dark:text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me Checkbox */}
              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 dark:border-slate-700 text-[#0d4a2b] focus:ring-[#0d4a2b] dark:bg-slate-800 cursor-pointer"
                  />
                  <span className="font-semibold text-gray-600 dark:text-gray-300">Remember credentials</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-xs font-bold text-[#0d4a2b] dark:text-[#5FA354] hover:underline cursor-pointer"
                >
                  Forgot?
                </button>
              </div>

              {/* Error Box */}
              {error && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs text-left animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Primary Sign In Button */}
              <button
                id="login-submit-btn"
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 bg-[#0a5c36] hover:bg-[#074729] active:bg-[#053a20] text-white rounded-xl font-bold text-sm sm:text-base transition-all shadow-md shadow-emerald-900/15 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 leading-none mt-2"
              >
                <span>Login</span>
              </button>

              {/* Quick Contact Center Auto-Fill & Enter Card */}
              <div
                id="contactcenter-quick-login-card"
                onClick={handleQuickContactCenterLogin}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleQuickContactCenterLogin();
                  }
                }}
                className="mt-3 p-2 sm:p-2.5 rounded-2xl bg-gradient-to-br from-emerald-50 via-green-50/70 to-emerald-50 dark:from-slate-800 dark:via-slate-800/90 dark:to-slate-900 border border-emerald-300/80 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md group select-none text-left"
                title="Click to automatically fill Contact Center credentials and log in"
              >
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <span className="text-[11px] font-bold text-[#0d4a2b] dark:text-[#5FA354] uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Quick Login
                  </span>
                  <span className="text-[10px] font-medium text-emerald-700/80 dark:text-emerald-400 group-hover:text-emerald-800 transition-colors">
                    Click to fill & enter
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/95 dark:bg-slate-900/90 rounded-xl px-2.5 py-1.5 border border-emerald-200/70 dark:border-slate-700 shadow-2xs">
                    <span className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Username</span>
                    <span className="block font-bold text-[#0d4a2b] dark:text-white text-[13px] tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>contactcenter</span>
                  </div>
                  <div className="bg-white/95 dark:bg-slate-900/90 rounded-xl px-2.5 py-1.5 border border-emerald-200/70 dark:border-slate-700 shadow-2xs">
                    <span className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Password</span>
                    <span className="block font-bold text-[#0d4a2b] dark:text-white text-[13px] tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>Eeu@1234</span>
                  </div>
                </div>
              </div>
            </form>

            {/* Bottom Credits & Copyright */}
            <div id="login-card-credits-footer" className="mt-6 pt-4 border-t border-gray-150/70 dark:border-slate-800 text-center space-y-1 select-text">
              <p className="text-[11.5px] font-medium text-gray-600 dark:text-gray-300">
                Developed by <span className="font-bold text-[#0d4a2b] dark:text-[#5FA354]">Zekarias Zenebe</span>
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-sans tracking-tight">
                Copyright © {new Date().getFullYear()} Ethiopian Electric Utility. All rights reserved.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* 24/7 IT Support Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-gray-100 dark:border-slate-800 text-left animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-[#0d4a2b] dark:text-[#5FA354] flex items-center justify-center font-bold">
                <Headphones className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base">EEU 24/7 Support Desk</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Contact Center Agent Assistance</p>
              </div>
            </div>
            <div className="space-y-2.5 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-slate-800/80 p-4 rounded-2xl border border-gray-200/80 dark:border-slate-700 font-mono">
              <p><strong>Hotline:</strong> 905 / +251 11 123 4567</p>
              <p><strong>IT Desk Email:</strong> support@eeu.gov.et</p>
              <p><strong>HQ Location:</strong> EEU HQ - ICT Department, Addis Ababa</p>
              <p><strong>Support Availability:</strong> 24/7 Continuous Operation</p>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSupportModal(false)}
                className="px-5 py-2.5 bg-[#0a5c36] text-white text-xs font-bold rounded-xl hover:bg-[#074729] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-gray-100 dark:border-slate-800 text-left animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-[#ea580c] dark:text-orange-400 flex items-center justify-center font-bold">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base">Password Recovery</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">EEU Employee Credentials Protocol</p>
              </div>
            </div>
            <div className="space-y-2.5 text-xs text-gray-700 dark:text-gray-300 bg-orange-50/50 dark:bg-orange-950/20 p-4 rounded-2xl border border-orange-200/80 dark:border-orange-900/50">
              <p className="font-semibold text-gray-900 dark:text-white">To reset your agent credentials:</p>
              <ul className="list-disc pl-4 space-y-1 text-gray-600 dark:text-gray-300">
                <li>Contact your Team Leader or Shift Supervisor.</li>
                <li>System Administrators can generate a new temporary passcode.</li>
                <li>Call internal hotline <strong>905</strong> for emergency reset.</li>
              </ul>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="px-5 py-2.5 bg-[#ea580c] text-white text-xs font-bold rounded-xl hover:bg-[#c2410c] cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* We're Here to Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-gray-100 dark:border-slate-800 text-left animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-[#0d4a2b] dark:text-[#5FA354] flex items-center justify-center font-bold">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base">We're Here to Help</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Contact Center Agent Support & Guidance</p>
              </div>
            </div>
            <div className="space-y-2.5 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-slate-800/80 p-4 rounded-2xl border border-gray-200/80 dark:border-slate-700">
              <p>Welcome to the official <strong>Ethiopian Electric Utility Contact Center Portal</strong>.</p>
              <p>This platform provides real-time access to feeder interruptions, live district outage tracking, resolution archiving, and electric billing & smart meter tariff calculators.</p>
              <p className="text-gray-500 dark:text-gray-400 text-[11px] font-mono">Shift supervisors and technical support are standing by 24/7.</p>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="px-5 py-2.5 bg-[#0a5c36] text-white text-xs font-bold rounded-xl hover:bg-[#074729] cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
