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
  Layers,
  ChevronRight,
  Home,
  CheckCircle2,
  Clock,
  Sparkles,
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
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Household & Spaces
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-text tracking-tight mt-1">
              Welcome back, {user?.name?.split(' ')[0]} 👋
            </h1>
            <p className="text-xs sm:text-sm text-text-muted mt-1">
              Manage your shared spaces, track individual bills, and monitor member payments.
            </p>
          </div>

          <Button
            onClick={() => setIsCreateOpen(true)}
            variant="primary"
            size="md"
            iconLeft={<Plus className="w-4 h-4 font-bold" />}
          >
            Create Space
          </Button>
        </div>

        {/* Quick Stat Highlights Bento */}
        {loading ? (
          <SkeletonStat count={3} />
        ) : (
          <Stagger className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <m.div variants={listItem}>
              <div className="stat-card">
                <div className="stat-top">
                  <span>Hosted Spaces</span>
                  <span className="stat-icon green">
                    <Home className="w-4 h-4" />
                  </span>
                </div>
                <strong>
                  <AnimatedNumber value={hostedGroups.length} />
                </strong>
                <p>Spaces organized by you</p>
                <div className="mini-bars" aria-hidden="true">
                  {[36, 52, 44, 65, 59, 78, 70, 92].map((height, index) => (
                    <i key={index} style={{ height: height * 0.7 }} />
                  ))}
                </div>
              </div>
            </m.div>

            <m.div variants={listItem}>
              <div className="stat-card">
                <div className="stat-top">
                  <span>Active Spaces</span>
                  <span className="stat-icon green">
                    <Clock className="w-4 h-4" />
                  </span>
                </div>
                <strong className="text-primary">
                  <AnimatedNumber value={totalActive} />
                </strong>
                <p>Currently tracking expenses</p>
                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: hostedGroups.length > 0 ? `${(totalActive / hostedGroups.length) * 100}%` : '0%',
                    }}
                  />
                </div>
              </div>
            </m.div>

            <m.div variants={listItem} className="col-span-2 sm:col-span-1">
              <div className="stat-card">
                <div className="stat-top">
                  <span>Settled Spaces</span>
                  <span className="stat-icon amber">
                    <CheckCircle2 className="w-4 h-4" />
                  </span>
                </div>
                <strong>
                  <AnimatedNumber value={totalSettled} />
                </strong>
                <p>Fully settled & locked ledgers</p>
                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill amber"
                    style={{
                      width: hostedGroups.length > 0 ? `${(totalSettled / hostedGroups.length) * 100}%` : '0%',
                    }}
                  />
                </div>
              </div>
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
              <Layers className="w-4 h-4 text-primary" />
              Spaces Hosted by You
            </h2>
            <span className="text-xs text-text-muted font-medium">
              {hostedGroups.length} total
            </span>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkeletonCard count={2} />
            </div>
          ) : hostedGroups.length === 0 ? (
            <EmptyState
              icon={<Users className="w-6 h-6 text-text-muted" />}
              title="No spaces created yet"
              description="Create a space for your apartment, shared room, trip, or household bills."
              actionText="Create Space"
              actionIcon={<Plus className="w-3.5 h-3.5" />}
              onAction={() => setIsCreateOpen(true)}
            />
          ) : (
            <Stagger className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hostedGroups.map((g) => (
                <m.div key={g.id} variants={listItem}>
                  <Link to={`/groups/${g.id}`} className="group block h-full">
                    <Card interactive tint="neutral" className="h-full flex flex-col justify-between space-y-4 p-5 hover:border-primary/50 transition-colors">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-bold text-lg text-text group-hover:text-primary transition truncate">
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
                        {g.description ? (
                          <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
                            {g.description}
                          </p>
                        ) : (
                          <p className="text-xs text-text-muted italic">
                            Household billing & expense tracker
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-border text-xs text-text-muted">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-text-muted" />
                          {formatDate(g.date)}
                        </span>
                        <span className="font-semibold text-primary transition flex items-center gap-1 text-xs">
                          Open Dashboard
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
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
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-text tracking-tight flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-500" />
                Spaces You Belong To
              </h2>
              <span className="text-xs text-text-muted font-medium">
                {memberGroups.length} spaces
              </span>
            </div>

            <Stagger className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {memberGroups.map((g) => (
                <m.div key={g.id} variants={listItem}>
                  <Link to={`/groups/${g.id}`} className="group block h-full">
                    <Card interactive tint="neutral" className="h-full flex flex-col justify-between space-y-3 p-5 hover:border-sky-500/50 transition-colors">
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
                        <span className="font-semibold text-sky-500 transition flex items-center gap-1 text-xs">
                          View Statement
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
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
