import { NavLink, Outlet } from 'react-router-dom';

type TimetableNavItem = {
  to: string;
  label: string;
  end?: boolean;
};

const NAV_ITEMS: TimetableNavItem[] = [
  {
    to: '/timetable',
    label: 'Overview',
    end: true,
  },
  {
    to: '/timetable/structure',
    label: 'Structure',
  },
  {
    to: '/timetable/imports',
    label: 'Imports',
  },
  {
    to: '/timetable/processed',
    label: 'Processed Rows',
  },
  {
    to: '/timetable/workspace',
    label: 'Workspace',
  },
];

export default function TimetableLayoutPage() {
  return (
    <div className="space-y-4">
      <section className="mx-4 mt-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  "inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Focus each task in its own page to avoid loading unrelated timetable data.
        </p>
      </section>

      <Outlet />
    </div>
  );
}
