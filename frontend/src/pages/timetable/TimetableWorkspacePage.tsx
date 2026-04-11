import { TimetableBuilderPage } from '../TimetableBuilder';

export default function TimetableWorkspacePage() {
  return (
    <>
      <section className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h3 className="text-sm font-semibold text-amber-900">Change Workspace View</h3>
        <p className="mt-1 text-sm text-amber-800">
          This view focuses on locked-system edits. Select a locked slot system and use the Edit Structure action to run the staged edit commit flow.
        </p>
      </section>

      <TimetableBuilderPage view="workspace" />
    </>
  );
}
