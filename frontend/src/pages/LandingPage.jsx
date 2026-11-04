import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Split,
  ArrowRight,
  Zap,
  Users,
  CheckCircle2,
  Receipt,
  CreditCard,
  Share2,
  Calculator,
  Lock,
  Sparkles,
} from 'lucide-react';
import Navbar from '../components/common/Navbar.jsx';
import Button from '../components/common/Button.jsx';
import { Card } from '../components/common/Card.jsx';

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background text-text flex flex-col transition-colors">
      {/* Top Floating Navbar with Theme Toggle & Sign In */}
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-14 sm:pt-20 pb-16 overflow-hidden px-4 sm:px-6">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-primary/10 rounded-full blur-[140px] pointer-events-none" />

          <div className="max-w-4xl mx-auto text-center relative z-10 space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-raised border border-border text-xs text-primary font-semibold shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>Smart billing dashboard for roommates, groups & trips</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-text leading-[1.12]">
              Shared expenses, <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 bg-clip-text text-transparent">
                crystal-clear repayments.
              </span>
            </h1>

            <p className="text-sm sm:text-lg text-text-muted max-w-2xl mx-auto leading-relaxed">
              When roommates or friends share rent, electricity, and trip costs, tracking who paid what gets chaotic.
              SplitOrbit organizes bills by person, tracks real-time status (<strong>Paid</strong>, <strong>Half Paid</strong>, <strong>Pending</strong>),
              and lets you share private statements in one click.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link to={user ? '/dashboard' : '/register'} className="w-full sm:w-auto">
                <Button size="lg" variant="primary" fullWidth iconRight={<ArrowRight className="w-4 h-4" />}>
                  {user ? 'Go to Dashboard' : 'Get Started Free'}
                </Button>
              </Link>
              {!user && (
                <Link to="/login" className="w-full sm:w-auto">
                  <Button size="lg" variant="secondary" fullWidth>
                    Sign In to Account
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* How It Works in 3 Quick Steps */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
          <div className="text-center space-y-2 mb-10">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Simple & Fast
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-text tracking-tight">
              How SplitOrbit Works in 3 Easy Steps
            </h2>
            <p className="text-xs sm:text-sm text-text-muted max-w-xl mx-auto">
              Everything you need to manage your household or outing bills without stress.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <Card className="relative flex flex-col justify-between space-y-4 p-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary font-black text-sm">
                    1
                  </div>
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                    Create Space
                  </span>
                </div>
                <h3 className="text-base font-bold text-text">Create Room & Add People</h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  Start a group for your apartment, house, or trip. Add roommates by name—they don't even need an account to be included.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-surface-raised border border-border text-[11px] text-text-muted flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <span>Zero signup barrier for roommates</span>
              </div>
            </Card>

            {/* Step 2 */}
            <Card className="relative flex flex-col justify-between space-y-4 p-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-500 font-black text-sm">
                    2
                  </div>
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                    Add Bills
                  </span>
                </div>
                <h3 className="text-base font-bold text-text">Assign Bills Individually</h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  Log rent, electricity, groceries, or Wi-Fi. Assign expenses to individual persons or split equally with exact math.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-surface-raised border border-border text-[11px] text-text-muted flex items-center gap-2">
                <Receipt className="w-4 h-4 text-sky-500 shrink-0" />
                <span>Precise calculations with zero rounding errors</span>
              </div>
            </Card>

            {/* Step 3 */}
            <Card className="relative flex flex-col justify-between space-y-4 p-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 font-black text-sm">
                    3
                  </div>
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                    Track & Share
                  </span>
                </div>
                <h3 className="text-base font-bold text-text">Track Status & Share Bills</h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  Monitor <strong>Paid</strong>, <strong>Half Paid</strong>, and <strong>Pending</strong> dues. Enter payments to see remaining balances update automatically, and share private WhatsApp links.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-surface-raised border border-border text-[11px] text-text-muted flex items-center gap-2">
                <Share2 className="w-4 h-4 text-amber-500 shrink-0" />
                <span>One-click WhatsApp statements & invite links</span>
              </div>
            </Card>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Card className="p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
                <CreditCard className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-text">Full Breakdown per Person</h3>
              <p className="text-xs text-text-muted leading-relaxed">
                See Total Share, Amount Paid, and Remaining Left to pay for each roommate at a glance, with visual progress bars.
              </p>
            </Card>

            <Card className="p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-500">
                <Calculator className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-text">Spending Charts & Insights</h3>
              <p className="text-xs text-text-muted leading-relaxed">
                Visual spending graphs over time and category donut breakdowns show where the household budget is going.
              </p>
            </Card>

            <Card className="p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-500">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-text">Private & Transparent</h3>
              <p className="text-xs text-text-muted leading-relaxed">
                Send friends their individual read-only statement links so they can verify their bills without seeing sensitive details.
              </p>
            </Card>
          </div>
        </section>

        {/* Ready to Start CTA */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20 pt-6">
          <div className="rounded-3xl bg-gradient-to-tr from-primary/15 via-surface-raised to-sky-500/10 border border-primary/25 p-8 sm:p-12 text-center space-y-5 shadow-lg relative overflow-hidden">
            <div className="max-w-xl mx-auto space-y-2">
              <h2 className="text-2xl sm:text-4xl font-black text-text tracking-tight">
                Ready to manage your household bills?
              </h2>
              <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
                Start tracking rent, utilities, and shared expenses cleanly today.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/register">
                <Button size="lg" variant="primary" iconRight={<ArrowRight className="w-4 h-4" />}>
                  Create Free Account
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="secondary">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 text-center text-xs text-text-muted">
        SplitOrbit © {new Date().getFullYear()} — Shared Household & Expense Billing System
      </footer>
    </div>
  );
}
