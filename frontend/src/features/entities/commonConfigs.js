import React from 'react';

export const yesNoRender = (value) => (value ? 'Yes' : 'No');

export const statusRender = (value) => value || '—';

export const toInteger = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const activeChip = (value) =>
  React.createElement(
    'span',
    {
      style: {
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 6,
        fontSize: '0.72rem',
        fontWeight: 600,
        backgroundColor: value ? '#DCFCE7' : '#FEE2E2',
        color: value ? '#16A34A' : '#DC2626',
      },
    },
    value ? 'Active' : 'Inactive'
  );

export const boolChip = (label, color = '#2563EB') => (value) =>
  React.createElement(
    'span',
    {
      style: {
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 6,
        fontSize: '0.72rem',
        fontWeight: 600,
        backgroundColor: value ? `${color}18` : '#F1F5F9',
        color: value ? color : '#94A3B8',
      },
    },
    value ? label : 'No'
  );

export const typeChip = (value) => {
  if (!value) return '—';
  const colors = {
    lecture_hall: '#7C3AED',
    classroom: '#2563EB',
    lab: '#D97706',
    seminar: '#0D9488',
    conference: '#DC2626',
    office: '#64748B',
  };
  const c = colors[value] || '#64748B';
  return React.createElement(
    'span',
    {
      style: {
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 6,
        fontSize: '0.72rem',
        fontWeight: 600,
        backgroundColor: `${c}15`,
        color: c,
      },
    },
    value.replace(/_/g, ' ')
  );
};

export const roleChip = (value) => {
  if (!value) return '—';
  const colors = { admin: '#DC2626', staff: '#D97706', faculty: '#2563EB', student: '#16A34A' };
  const c = colors[value] || '#64748B';
  return React.createElement(
    'span',
    {
      style: {
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 6,
        fontSize: '0.72rem',
        fontWeight: 700,
        backgroundColor: `${c}15`,
        color: c,
        textTransform: 'capitalize',
      },
    },
    value
  );
};
