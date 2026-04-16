import { Link } from 'react-router-dom';

const SECTION_CARDS = [
  {
    to: '/timetable/structure',
    title: 'Structure',
    description: 'Manage slot systems, days, bands, lanes, and the grid editor.',
  },
  {
    to: '/timetable/imports',
    title: 'Imports',
    description: 'Check sheet status, upload allocation data, and run preview + commit.',
  },
  {
    to: '/timetable/processed',
    title: 'Processed Rows',
    description: 'Load processed rows only when needed and resolve booking-level issues.',
  },
  {
    to: '/timetable/workspace',
    title: 'Workspace',
    description: 'Open locked-system edit workflows and staged structure commits.',
  },
] as const;

export default function TimetableOverviewPage() {
  return (
    <section className="mx-4 rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-2xl font-bold text-slate-900">Timetable Console</h2>
      <p className="mt-2 text-sm text-slate-600">
        Use focused pages instead of one long editor view. This keeps the UI cleaner and avoids loading heavy data until you explicitly request it.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SECTION_CARDS.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4 transition-colors hover:border-slate-400 hover:bg-slate-100"
          >
            <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3>
            <p className="mt-1 text-xs text-slate-600">{card.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
