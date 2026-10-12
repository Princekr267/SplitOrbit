import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/common/Navbar.jsx';
import CreateGroupModal from '../components/forms/CreateGroupModal.jsx';
import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import { Card } from '../components/common/Card.jsx';
import { SkeletonStat, SkeletonCard } from '../components/common/Skeleton.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDate } from '../utils/date.js';
import {
  Plus,
  Users,
  Calendar,
  ArrowRight,
  Layers,
  CheckCircle,
  Clock,
  ChevronRight,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { m } from 'motion/react';
import { Stagger, AnimatedNumber } from '../motion/components.jsx';
import { listItem } from '../motion/variants.js';

export default function HostDashboardPage() {
  const { user } = useAuth();
  const [hostedGroups, setHostedGroups] = useState([]);
  const [memberGroups, setMemberGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/groups');
      if (res.success) {
        setHostedGroups(res.data.hosted || []);
        setMemberGroups(res.data.member || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load your groups.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const totalActive = hostedGroups.filter((g) => g.status === 'active').length;
  const totalSettled = hostedGroups.filter((g) => g.status === 'settled').length;

  return (
    <div className="min-h-screen bg-background text-text flex flex-col transition-colors">
      <Navbar onOpenNewGroup={() => setIsCreateOpen(true)} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Welcome & Stats Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-text tracking-tight">
              Welcome back, {user?.name?.split(' ')[0]} 👋
            </h1>
            <p className="text-xs sm:text-sm text-text-muted mt-1">
              Manage your shared outings, track expenses, and view member balances.
            </p>
          </div>

          <Button
            onClick={() => setIsCreateOpen(true)}
            variant="primary"
            size="md"
            iconLeft={<Plus className="w-4 h-4" />}
          >
            Create Group
          </Button>
        </div>

        {/* Quick Stat Highlights Bento */}
        {loading ? (
          <SkeletonStat count={3} />
        ) : (
          <Stagger className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <m.div variants={listItem}>
              <Card interactive tint="neutral" className="p-4 space-y-1">
                <span className="text-xs text-text-muted font-medium block">
                  Hosted Groups
                </span>
                <span className="text-2xl font-black text-text mt-1 block font-mono tabular-nums">
                  <AnimatedNumber value={hostedGroups.length} />
                </span>
                <span className="text-[11px] text-text-muted block">
                  Trips and events organized by you
                </span>
              </Card>
            </m.div>

            <m.div variants={listItem}>
              <Card interactive tint="success" className="p-4 space-y-1">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium block">
                  Active Ledgers
                </span>
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block font-mono tabular-nums">
                  <AnimatedNumber value={totalActive} />
                </span>
                <span className="text-[11px] text-text-muted block">
                  Currently tracking expenses
                </span>
              </Card>
            </m.div>

            <m.div variants={listItem} className="col-span-2 sm:col-span-1">
              <Card interactive tint="neutral" className="p-4 space-y-1">
                <span className="text-xs text-text-muted font-medium block">
                  Settled Groups
                </span>
                <span className="text-2xl font-black text-text-muted mt-1 block font-mono tabular-nums">
                  <AnimatedNumber value={totalSettled} />
                </span>
                <span className="text-[11px] text-text-muted block">
                  Balances zeroed and locked
                </span>
              </Card>
            </m.div>
          </Stagger>
        )}

        {/* Error State with Retry */}
        {error && (
          <ErrorState
            title="Failed to load hosted groups"
            error={error}
            onRetry={fetchGroups}
            className="my-4"
          />
        )}

        {/* Hosted Groups Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-text tracking-tight flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-500" />
              Groups Hosted by You
            </h2>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkeletonCard count={2} />
            </div>
          ) : hostedGroups.length === 0 ? (
            <EmptyState
              icon={<Users className="w-6 h-6 text-text-muted" />}
              title="No groups created yet"
              description="Create a group for your next road trip, dinner, or shared flat expenses to start tracking."
              actionText="Create Group"
              actionIcon={<Plus className="w-3.5 h-3.5" />}
              onAction={() => setIsCreateOpen(true)}
            />
          ) : (
            <Stagger className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hostedGroups.map((g) => (
                <m.div key={g.id} variants={listItem}>
                  <Link
                    to={`/groups/${g.id}`}
                    className="group block h-full"
                  >
                    <Card interactive tint="neutral" className="h-full flex flex-col justify-between space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-base text-text group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition truncate">
                              {g.name}
                            </h3>
                            <Badge
                              variant={g.status === 'active' ? 'active' : 'settled'}
                              size="xs"
                              showIcon
                            >
                              {g.status === 'active' ? 'Active' : 'Settled'}
                            </Badge>
                          </div>
                          {g.description && (
                            <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
                              {g.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-border text-xs text-text-muted">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-text-muted" />
                          {formatDate(g.date)}
                        </span>
                        <span className="font-semibold text-text group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition flex items-center gap-1 text-[11px]">
                          Open Ledger
                          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </div>
                    </Card>
                  </Link>
                </m.div>
              ))}
            </Stagger>
          )}
        </section>

        {/* Member Groups Section (Friend Profile) */}
        {memberGroups.length > 0 && (
          <section className="space-y-4 pt-4 border-t border-border">
            <h2 className="text-base font-bold text-text tracking-tight flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-500" />
              Groups You Belong To (Friend Profile)
            </h2>

            <Stagger className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {memberGroups.map((g) => (
                <m.div key={g.id} variants={listItem}>
                  <Link
                    to={`/groups/${g.id}`}
                    className="group block h-full"
                  >
                    <Card interactive tint="neutral" className="h-full flex flex-col justify-between space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-bold text-base text-text group-hover:text-sky-500 transition truncate">
                          {g.name}
                        </h3>
                        <Badge variant="info" size="xs">
                          Member
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-text-muted">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-text-muted" />
                          {formatDate(g.date)}
                        </span>
                        <span className="font-semibold text-text group-hover:text-sky-500 transition flex items-center gap-1 text-[11px]">
                          View Statement
                          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </div>
                    </Card>
                  </Link>
                </m.div>
              ))}
            </Stagger>
          </section>
        )}
      </main>

      <CreateGroupModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onGroupCreated={(newGroup) => {
          setHostedGroups((prev) => [newGroup, ...prev]);
        }}
      />
    </div>
  );
}
