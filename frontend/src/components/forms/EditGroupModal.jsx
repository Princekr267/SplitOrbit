import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal.jsx';
import api from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Calendar, FileText, Type } from 'lucide-react';

export default function EditGroupModal({ isOpen, onClose, group, onGroupUpdated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    if (group && isOpen) {
      setName(group.name || '');
      setDescription(group.description || '');
      setDate(group.date ? new Date(group.date).toISOString().slice(0, 10) : '');
    }
  }, [group, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast('Group name cannot be empty', 'error');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        name: name.trim(),
        description: description.trim(),
      };
      if (date) {
        payload.date = new Date(date).toISOString();
      }

      const res = await api.patch(`/groups/${group.id}`, payload);

      if (res.success && res.data) {
        addToast('Group details updated! ✨', 'success');
        if (onGroupUpdated) {
          onGroupUpdated(res.data);
        }
        onClose();
      }
    } catch (err) {
      addToast(err.message || 'Failed to update group details', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Group Details">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            <Type className="w-3.5 h-3.5 text-brand-500" />
            Group Name *
          </label>
          <input
            type="text"
            required
            maxLength={100}
            placeholder="e.g. Goa Trip 2026, Flat 402 Expenses"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text placeholder-text-muted text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
          />
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            <Calendar className="w-3.5 h-3.5 text-sky-500" />
            Trip / Event Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text placeholder-text-muted text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
          />
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            <FileText className="w-3.5 h-3.5 text-amber-500" />
            Description / Notes (Optional)
          </label>
          <textarea
            rows="3"
            maxLength={500}
            placeholder="Add trip notes, itinerary, or details..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-surface-raised border border-border text-text placeholder-text-muted text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-text-muted hover:text-text transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-brand-500 text-slate-950 hover:bg-brand-400 transition shadow-lg shadow-brand-500/20 disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
