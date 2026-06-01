/**
 * Shared alert display helpers — used by LiveRoom, Logs, and any future
 * component that renders alert cards or person KPI scores.
 *
 * Keep this file free of React imports so it can be used in plain JS too.
 */

// ── KPI score colour scale (contract §1) ─────────────────────────────────────
// Returns Tailwind class names for text + background.
export const getScoreStyle = (score) => {
  if (score === 0)  return { text: 'text-slate-400',   bg: 'bg-slate-700/60'   };
  if (score <= 33)  return { text: 'text-emerald-400', bg: 'bg-emerald-900/50' };
  if (score <= 66)  return { text: 'text-yellow-400',  bg: 'bg-yellow-900/50'  };
  return              { text: 'text-red-400',     bg: 'bg-red-900/50'    };
};

// ── Trigger-type badge config (contract §4.6, §5) ────────────────────────────
export const TRIGGER_LABELS = {
  CLIMBING:  { label: 'Climbing Detected',  color: 'bg-red-900/60 text-red-300',       icon: '⚠️' },
  LOITERING: { label: 'Loitering in Zone',  color: 'bg-amber-900/60 text-amber-300',   icon: '⏱'  },
  COMBINED:  { label: 'Combined Risk',      color: 'bg-purple-900/60 text-purple-300', icon: '🔀' },
  INTRUSION: { label: 'Perimeter Crossed',  color: 'bg-red-900/60 text-red-300',       icon: '🚨' },
};

// ── Alert-type badge colours (used in Logs table + ActivityLog) ──────────────
export const ALERT_TYPE_COLORS = {
  loitering: 'bg-amber-900/50 text-amber-300',
  climbing:  'bg-red-900/50 text-red-300',
  combined:  'bg-purple-900/50 text-purple-300',
  intrusion: 'bg-red-900/50 text-red-300',
};
