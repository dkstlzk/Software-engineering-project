import { request, requestFormData } from "./client";
import type {
  SlotSystem,
  SlotDay,
  SlotTimeBand,
  SlotBlock,
  SlotFullGrid,
  DayOfWeek,
  TimetableImportBatchSummary,
  TimetableImportPreviewReport,
  TimetableImportDecisionSaveReport,
  TimetableImportTransferRowReport,
  TimetableImportCommitDecision,
  TimetableImportCommitReport,
  TimetableImportBatchDeleteReport,
  TimetableImportProcessedRowsReport,
  TimetableImportBatchListResponse,
  CommitSessionSummary,
  CommitStageReport,
  CommitSessionResolutionDecision,
  CommitSessionFinalizeReport,
  CommitSessionCancelResponse,
  EditCommitSessionStartResponse,
  TimetableSnapshotState,
  SlotSystemChanges,
  ChangePreviewResult,
  ChangeApplyResult,
} from "./types";

// Slot Systems
export async function getSlotSystems(): Promise<SlotSystem[]> {
  const systems = await request<SlotSystem[]>("/timetable/slot-systems");

  return [...systems].sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);

    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && bTime !== aTime) {
      return bTime - aTime;
    }

    return b.id - a.id;
  });
}

export async function createSlotSystem(name: string): Promise<SlotSystem> {
  return request<SlotSystem>("/timetable/slot-systems", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function deleteSlotSystem(slotSystemId: number): Promise<void> {
  await request<void>(`/timetable/slot-systems/${slotSystemId}`, {
    method: "DELETE",
  });
}

// Days
export async function getDays(slotSystemId: number): Promise<SlotDay[]> {
  const params = new URLSearchParams({ slotSystemId: String(slotSystemId) });
  return request<SlotDay[]>(`/timetable/days?${params.toString()}`);
}

export async function createDay(input: {
  slotSystemId: number;
  dayOfWeek: DayOfWeek;
  orderIndex?: number;
}): Promise<SlotDay> {
  return request<SlotDay>("/timetable/days", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteDay(dayId: number): Promise<void> {
  await request<void>(`/timetable/days/${dayId}`, {
    method: "DELETE",
  });
}

export async function addDayLane(dayId: number): Promise<SlotDay> {
  return request<SlotDay>(`/timetable/days/${dayId}/lanes`, {
    method: "POST",
  });
}

export async function removeDayLane(dayId: number): Promise<SlotDay> {
  return request<SlotDay>(`/timetable/days/${dayId}/lanes`, {
    method: "DELETE",
  });
}

// Time Bands
export async function getTimeBands(slotSystemId: number): Promise<SlotTimeBand[]> {
  const params = new URLSearchParams({ slotSystemId: String(slotSystemId) });
  return request<SlotTimeBand[]>(`/timetable/time-bands?${params.toString()}`);
}

export async function createTimeBand(input: {
  slotSystemId: number;
  startTime: string;
  endTime: string;
  orderIndex?: number;
}): Promise<SlotTimeBand> {
  return request<SlotTimeBand>("/timetable/time-bands", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTimeBand(
  timeBandId: number,
  input: {
    startTime?: string;
    endTime?: string;
    orderIndex?: number;
  }
): Promise<SlotTimeBand> {
  return request<SlotTimeBand>(`/timetable/time-bands/${timeBandId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteTimeBand(timeBandId: number): Promise<void> {
  await request<void>(`/timetable/time-bands/${timeBandId}`, {
    method: "DELETE",
  });
}

// Blocks
export async function getFullGrid(slotSystemId: number): Promise<SlotFullGrid> {
  return request<SlotFullGrid>(`/timetable/slot-systems/${slotSystemId}/full`);
}

export async function createBlock(input: {
  slotSystemId: number;
  dayId: number;
  startBandId: number;
  laneIndex: number;
  rowSpan: number;
  label: string;
}): Promise<SlotBlock> {
  return request<SlotBlock>("/timetable/blocks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteBlock(blockId: number): Promise<void> {
  await request<void>(`/timetable/blocks/${blockId}`, {
    method: "DELETE",
  });
}

// Timetable Import
export async function getTimetableImportBatches(input?: {
  slotSystemId?: number;
  limit?: number;
}): Promise<TimetableImportBatchSummary[]> {
  const params = new URLSearchParams();

  if (input?.slotSystemId !== undefined) {
    params.set("slotSystemId", String(input.slotSystemId));
  }

  if (input?.limit !== undefined) {
    params.set("limit", String(input.limit));
  }

  const query = params.toString();
  const response = await request<TimetableImportBatchListResponse>(
    `/timetable/imports${query ? `?${query}` : ""}`,
  );

  return [...response.data].sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);

    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && bTime !== aTime) {
      return bTime - aTime;
    }

    return b.batchId - a.batchId;
  });
}

export async function getTimetableImportBatch(
  batchId: number,
): Promise<TimetableImportPreviewReport> {
  return request<TimetableImportPreviewReport>(`/timetable/imports/${batchId}`);
}

export async function saveTimetableImportDecisions(
  batchId: number,
  decisions: TimetableImportCommitDecision[],
): Promise<TimetableImportDecisionSaveReport> {
  return request<TimetableImportDecisionSaveReport>(`/timetable/imports/${batchId}/decisions`, {
    method: "PUT",
    body: JSON.stringify({ decisions }),
  });
}

export async function transferTimetableImportRow(
  batchId: number,
  rowId: number,
  targetSlotSystemId: number,
): Promise<TimetableImportTransferRowReport> {
  return request<TimetableImportTransferRowReport>(
    `/timetable/imports/${batchId}/rows/${rowId}/transfer`,
    {
      method: "POST",
      body: JSON.stringify({ targetSlotSystemId }),
    },
  );
}

export async function previewTimetableImport(input: {
  slotSystemId: number;
  termStartDate: string;
  termEndDate: string;
  file: File;
  aliasMap?: Record<string, string>;
}): Promise<TimetableImportPreviewReport> {
  const formData = new FormData();
  formData.append("slotSystemId", String(input.slotSystemId));
  formData.append("termStartDate", input.termStartDate);
  formData.append("termEndDate", input.termEndDate);
  formData.append("file", input.file);

  if (input.aliasMap && Object.keys(input.aliasMap).length > 0) {
    formData.append("aliasMap", JSON.stringify(input.aliasMap));
  }

  return requestFormData<TimetableImportPreviewReport>("/timetable/imports/preview", formData);
}

export async function commitTimetableImport(
  batchId: number,
  decisions: TimetableImportCommitDecision[]
): Promise<TimetableImportCommitReport> {
  return request<TimetableImportCommitReport>(`/timetable/imports/${batchId}/commit`, {
    method: "POST",
    body: JSON.stringify({ decisions }),
  });
}

export async function reallocateTimetableImport(
  batchId: number,
  decisions: TimetableImportCommitDecision[],
): Promise<TimetableImportCommitReport> {
  return request<TimetableImportCommitReport>(`/timetable/imports/${batchId}/reallocate`, {
    method: "POST",
    body: JSON.stringify({ decisions }),
  });
}

export async function deleteTimetableImportBatch(
  batchId: number,
): Promise<TimetableImportBatchDeleteReport> {
  return request<TimetableImportBatchDeleteReport>(`/timetable/imports/${batchId}`, {
    method: "DELETE",
  });
}

export async function getTimetableImportProcessedRows(
  batchId: number,
): Promise<TimetableImportProcessedRowsReport> {
  return request<TimetableImportProcessedRowsReport>(
    `/timetable/imports/${batchId}/processed-rows`,
  );
}

// Staged Commit Session Flow

export async function startCommitSession(
  batchId: number,
  decisions: TimetableImportCommitDecision[],
): Promise<CommitSessionSummary> {
  return request<CommitSessionSummary>("/timetable/commit/start", {
    method: "POST",
    body: JSON.stringify({
      batchId,
      decisions,
    }),
  });
}

export async function startEditCommitSession(input: {
  slotSystemId: number;
  expectedVersion: number;
  newState: TimetableSnapshotState;
  pruneBookings?: boolean;
}): Promise<EditCommitSessionStartResponse> {
  return request<EditCommitSessionStartResponse>("/timetable/edit/start", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function runExternalCommitCheck(
  commitSessionId: number,
): Promise<CommitStageReport> {
  return request<CommitStageReport>("/timetable/commit/external-check", {
    method: "POST",
    body: JSON.stringify({ commitSessionId }),
  });
}

export async function resolveExternalCommitConflicts(
  commitSessionId: number,
  resolutions: CommitSessionResolutionDecision[],
): Promise<CommitSessionSummary> {
  return request<CommitSessionSummary>("/timetable/commit/external-resolve", {
    method: "POST",
    body: JSON.stringify({ commitSessionId, resolutions }),
  });
}

export async function runInternalCommitCheck(
  commitSessionId: number,
): Promise<CommitStageReport> {
  return request<CommitStageReport>("/timetable/commit/internal-check", {
    method: "POST",
    body: JSON.stringify({ commitSessionId }),
  });
}

export async function resolveInternalCommitConflicts(
  commitSessionId: number,
  resolutions: CommitSessionResolutionDecision[],
): Promise<CommitSessionSummary> {
  return request<CommitSessionSummary>("/timetable/commit/internal-resolve", {
    method: "POST",
    body: JSON.stringify({ commitSessionId, resolutions }),
  });
}

export async function startCommitFreeze(
  commitSessionId: number,
): Promise<CommitSessionSummary> {
  return request<CommitSessionSummary>("/timetable/commit/freeze", {
    method: "POST",
    body: JSON.stringify({ commitSessionId }),
  });
}

export async function runRuntimeCommitCheck(
  commitSessionId: number,
): Promise<CommitStageReport> {
  return request<CommitStageReport>("/timetable/commit/runtime-check", {
    method: "POST",
    body: JSON.stringify({ commitSessionId }),
  });
}

export async function resolveRuntimeCommitConflicts(
  commitSessionId: number,
  resolutions: CommitSessionResolutionDecision[],
): Promise<CommitSessionSummary> {
  return request<CommitSessionSummary>("/timetable/commit/runtime-resolve", {
    method: "POST",
    body: JSON.stringify({ commitSessionId, resolutions }),
  });
}

export async function finalizeCommitSession(
  commitSessionId: number,
): Promise<CommitSessionFinalizeReport> {
  return request<CommitSessionFinalizeReport>("/timetable/commit/finalize", {
    method: "POST",
    body: JSON.stringify({ commitSessionId }),
  });
}

export async function cancelCommitSession(
  commitSessionId: number,
): Promise<CommitSessionCancelResponse> {
  return request<CommitSessionCancelResponse>("/timetable/commit/cancel", {
    method: "POST",
    body: JSON.stringify({ commitSessionId }),
  });
}

export async function getCommitSessionStatus(
  commitSessionId: number,
): Promise<CommitSessionSummary> {
  return request<CommitSessionSummary>(`/timetable/commit/${commitSessionId}/status`);
}

// Slot System Change Workspace

export async function previewSlotSystemChanges(
  slotSystemId: number,
  changes: SlotSystemChanges,
): Promise<ChangePreviewResult> {
  return request<ChangePreviewResult>(
    `/timetable/slot-systems/${slotSystemId}/preview-changes`,
    {
      method: "POST",
      body: JSON.stringify({ changes }),
    },
  );
}

export async function applySlotSystemChanges(
  slotSystemId: number,
  changes: SlotSystemChanges,
): Promise<ChangeApplyResult> {
  return request<ChangeApplyResult>(
    `/timetable/slot-systems/${slotSystemId}/apply-changes`,
    {
      method: "POST",
      body: JSON.stringify({ changes }),
    },
  );
}
