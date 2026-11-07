import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Split,
  LogOut,
  PlusCircle,
  Shield,
  Calculator as CalcIcon,
  Menu,
  X,
  Users,
  LayoutDashboard,
  User,
} from 'lucide-react';
import ThemeToggle from './ThemeToggle.jsx';
import AnnouncementBanner from './AnnouncementBanner.jsx';
import { m, AnimatePresence } from 'motion/react';
import { springs } from '../../motion/tokens.js';
import { isDemoModeActive, disableDemoMode } from '../../api/client.js';

export default function Navbar({ onOpenNewGroup }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile drawer on route navigation
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile drawer on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsMobileMenuOpen(false);
    };
    if (isMobileMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  const handleLogout = async () => {
    setIsMobileMenuOpen(false);
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-surface/85 backdrop-blur-md transition-colors">
      {user && <AnnouncementBanner />}
      <div className="mx-auto flex items-center justify-between max-w-6xl h-16 px-4 sm:px-6">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <m.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={springs.snappy}
            className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-slate-950 shadow-lg shadow-brand-500/20 shrink-0"
          >
            <Split className="w-5 h-5 font-bold" />
          </m.div>
          <span className="font-extrabold text-xl tracking-tight text-text group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors">
            SplitOrbit
          </span>
        </Link>

        {/* Desktop Navigation (>= md screens) */}
        <div className="hidden md:flex items-center gap-2.5 lg:gap-3">
          {/* Quick Calculator Trigger */}
          <m.button
            type="button"
            data-calculator-trigger="true"
            whileTap={{ scale: 0.92 }}
            transition={springs.snappy}
            onClick={() => window.dispatchEvent(new CustomEvent('splitorbit:toggle-calculator'))}
            title="Financial Calculator"
            aria-label="Toggle financial calculator"
            className="p-2 rounded-xl text-text-muted hover:text-text hover:bg-surface-raised transition-colors border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
          >
            <CalcIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </m.button>

          {/* Theme Toggle */}
          <ThemeToggle />

          {isDemoModeActive() && (
            <button
              type="button"
              onClick={() => {
                disableDemoMode();
                window.location.href = '/login';
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition cursor-pointer"
              title="Currently viewing offline mock data. Click to reconnect to your real database account."
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Demo Mode • Exit
            </button>
          )}

          {user ? (
            <>
              {onOpenNewGroup && (
                <m.button
                  whileTap={{ scale: 0.95 }}
                  transition={springs.snappy}
                  onClick={onOpenNewGroup}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 text-slate-950 hover:bg-brand-400 transition-colors shadow-md shadow-brand-500/10 cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  New Group
                </m.button>
              )}

              <Link
                to="/dashboard"
                className="px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-text hover:bg-surface-raised transition-colors"
              >
                Dashboard
              </Link>

              <Link
                to="/friend"
                className="px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-text hover:bg-surface-raised transition-colors"
              >
                Friend Passbook
              </Link>

              {user.role === 'admin' && (
                <Link
                  to="/admin"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors shadow-xs"
                >
                  <Shield className="w-3.5 h-3.5" />
                  Admin
                </Link>
              )}

              <div className="h-4 w-px bg-border mx-1" />

              <div className="flex items-center gap-2">
                <Link
                  to="/profile"
                  className="flex items-center gap-2 p-1 -m-1 rounded-xl hover:bg-surface-raised transition-colors group"
                  title={`View Profile (@${user.username})`}
                >
                  <div className="w-8 h-8 rounded-full bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-text text-xs font-bold shrink-0 group-hover:scale-105 transition-transform">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium text-text truncate max-w-[100px] leading-tight">
                      {user.name}
                    </span>
                    {user.username && (
                      <span className="text-[10px] text-text-muted font-mono leading-none truncate max-w-[100px]">
                        @{user.username}
                      </span>
                    )}
                  </div>
                </Link>

                <m.button
                  whileTap={{ scale: 0.92 }}
                  transition={springs.snappy}
                  onClick={handleLogout}
                  title="Log out"
                  className="p-1.5 rounded-lg text-text-muted hover:text-rose-500 dark:hover:text-rose-400 hover:bg-surface-raised transition-colors ml-0.5 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </m.button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-text transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 text-slate-950 hover:bg-brand-400 transition-colors shadow-sm"
              >
                Get Started
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Action Controls (< md screens) */}
        <div className="flex md:hidden items-center gap-2">
          {/* Quick Calculator */}
          <m.button
            type="button"
            data-calculator-trigger="true"
            whileTap={{ scale: 0.92 }}
            transition={springs.snappy}
            onClick={() => window.dispatchEvent(new CustomEvent('splitorbit:toggle-calculator'))}
            title="Financial Calculator"
            aria-label="Toggle financial calculator"
            className="p-2 rounded-xl text-text-muted hover:text-text hover:bg-surface-raised transition-colors border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
          >
            <CalcIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </m.button>

          {/* Compact Theme Cycle Button */}
          <ThemeToggle compact />

          {/* Mobile Hamburger / Close Button */}
          <m.button
            type="button"
            whileTap={{ scale: 0.9 }}
            transition={springs.snappy}
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isMobileMenuOpen}
            className="p-2 rounded-xl text-text-muted hover:text-text hover:bg-surface-raised transition-colors border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
          >
            <AnimatePresence mode="wait" initial={false}>
              {isMobileMenuOpen ? (
                <m.span
                  key="close-icon"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center justify-center text-text"
                >
                  <X className="w-5 h-5" />
                </m.span>
              ) : (
                <m.span
                  key="menu-icon"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center justify-center text-text"
                >
                  <Menu className="w-5 h-5" />
                </m.span>
              )}
            </AnimatePresence>
          </m.button>
        </div>
      </div>

      {/* Mobile Animated Dropdown Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <m.div
            key="mobile-nav-drawer"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="md:hidden border-b border-border bg-surface/95 backdrop-blur-xl overflow-hidden shadow-2xl transition-colors"
          >
            <div className="px-4 py-4 space-y-3">
              {/* Profile Card if Logged In */}
              {user && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-surface-raised border border-border">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-500 flex items-center justify-center font-bold text-sm shrink-0">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-text truncate">{user.name}</div>
                      <div className="text-xs text-text-muted truncate">{user.email}</div>
                    </div>
                  </div>
                  {user.role === 'admin' && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                      ADMIN
                    </span>
                  )}
                </div>
              )}

              {/* Navigation Links */}
              <div className="space-y-1">
                {user ? (
                  <>
                    {onOpenNewGroup && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          onOpenNewGroup();
                        }}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-brand-500 text-slate-950 active:scale-98 transition shadow-sm mb-2 cursor-pointer"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Create New Group</span>
                      </button>
                    )}

                    <Link
                      to="/dashboard"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-text hover:bg-surface-raised active:bg-surface-raised transition"
                    >
                      <LayoutDashboard className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Dashboard</span>
                    </Link>

                    <Link
                      to="/friend"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-text hover:bg-surface-raised active:bg-surface-raised transition"
                    >
                      <Users className="w-4 h-4 text-sky-500 shrink-0" />
                      <span>Friend Passbook</span>
                    </Link>

                    {user.role === 'admin' && (
                      <Link
                        to="/admin"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition"
                      >
                        <Shield className="w-4 h-4 shrink-0" />
                        <span>Admin Console</span>
                      </Link>
                    )}

                    <Link
                      to="/profile"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-text hover:bg-surface-raised active:bg-surface-raised transition"
                    >
                      <User className="w-4 h-4 text-brand-500 shrink-0" />
                      <span>My Profile</span>
                    </Link>

                    <div className="pt-2 border-t border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted font-medium">Theme:</span>
                        <ThemeToggle />
                      </div>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-500/10 active:bg-rose-500/20 transition cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2 pt-1">
                    <Link
                      to="/login"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl text-sm font-semibold text-text hover:bg-surface-raised border border-border transition"
                    >
                      Sign In
                    </Link>
                    <Link
                      to="/register"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl text-sm font-bold bg-brand-500 text-slate-950 hover:bg-brand-400 transition shadow-sm"
                    >
                      Get Started Free
                    </Link>
                    <div className="pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-xs text-text-muted font-medium">Appearance:</span>
                      <ThemeToggle />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  );
}
