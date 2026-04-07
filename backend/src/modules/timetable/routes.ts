import { Router } from "express";
import {
	handleAddDayLane,
	handleRemoveDayLane,
	handleCreateBlock,
	handleCreateDay,
	handlePreviewImport,
	handleListImportBatches,
	handleGetImportBatch,
	handleSaveImportDecisions,
	handleTransferImportRow,
	handleReallocateImport,
	handleDeleteImportBatch,
	handleGetProcessedImportRows,
	handleCommitImport,
	handleCreateSlotSystem,
	handleCreateTimeBand,
	handleDeleteDay,
	handleDeleteSlotSystem,
	handleDeleteTimeBand,
	handleDeleteBlock,
	handleGetDays,
	handleGetFullGrid,
	handleGetSlotSystems,
	handleGetTimeBands,
	handleUpdateTimeBand,
	handleDetectCommitConflicts,
	handleCommitWithResolutions,
	handleCancelCommit,
	handleGetFreezeStatus,
	handlePreviewSlotSystemChanges,
	handleApplySlotSystemChanges,
	handleStartCommitSession,
	handleStartEditCommitSession,
	handleExternalCommitCheck,
	handleExternalCommitResolve,
	handleInternalCommitCheck,
	handleInternalCommitResolve,
	handleStartCommitFreeze,
	handleRuntimeCommitCheck,
	handleRuntimeCommitResolve,
	handleFinalizeCommitSession,
	handleCancelCommitSession,
	handleGetCommitSessionStatus,
} from "./controller";
import { authMiddleware } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import multer from "multer";
import {
	timetableImportCommitLimiter,
	timetableImportMutationLimiter,
	timetableImportPreviewLimiter,
	timetableImportReadLimiter,
} from "../../api/middleware/rateLimit.middleware";

const router = Router();
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 10 * 1024 * 1024,
	},
});

router.use(authMiddleware);
router.use(requireRole("ADMIN"));

router.post("/slot-systems", handleCreateSlotSystem);
router.get("/slot-systems", handleGetSlotSystems);
router.delete("/slot-systems/:id", handleDeleteSlotSystem);
router.get("/slot-systems/:id/full", handleGetFullGrid);

router.post("/days", handleCreateDay);
router.get("/days", handleGetDays);
router.delete("/days/:id", handleDeleteDay);
router.post("/days/:id/lanes", handleAddDayLane);
router.delete("/days/:id/lanes", handleRemoveDayLane);

router.post("/time-bands", handleCreateTimeBand);
router.get("/time-bands", handleGetTimeBands);
router.patch("/time-bands/:id", handleUpdateTimeBand);
router.delete("/time-bands/:id", handleDeleteTimeBand);

router.post("/blocks", handleCreateBlock);
router.delete("/blocks/:id", handleDeleteBlock);

router.get("/imports", timetableImportReadLimiter, handleListImportBatches);
router.post(
	"/imports/preview",
	timetableImportPreviewLimiter,
	upload.single("file"),
	handlePreviewImport,
);
router.get("/imports/:id", timetableImportReadLimiter, handleGetImportBatch);
router.put("/imports/:id/decisions", timetableImportMutationLimiter, handleSaveImportDecisions);
router.post(
	"/imports/:id/rows/:rowId/transfer",
	timetableImportMutationLimiter,
	handleTransferImportRow,
);
router.post("/imports/:id/reallocate", timetableImportCommitLimiter, handleReallocateImport);
router.post("/imports/:id/commit", timetableImportCommitLimiter, handleCommitImport);
router.delete("/imports/:id", timetableImportMutationLimiter, handleDeleteImportBatch);
router.get(
	"/imports/:id/processed-rows",
	timetableImportReadLimiter,
	handleGetProcessedImportRows,
);

// Conflict detection and resolution endpoints
router.post(
	"/imports/:id/detect-conflicts",
	timetableImportCommitLimiter,
	handleDetectCommitConflicts,
);
router.post(
	"/imports/:id/commit-with-resolutions",
	timetableImportCommitLimiter,
	handleCommitWithResolutions,
);
router.post("/imports/:id/cancel-commit", timetableImportMutationLimiter, handleCancelCommit);
router.get("/imports/:id/freeze-status", timetableImportReadLimiter, handleGetFreezeStatus);

// New staged commit session flow (external -> internal -> freeze -> runtime -> finalize)
router.post("/commit/start", timetableImportCommitLimiter, handleStartCommitSession);
router.post("/edit/start", timetableImportCommitLimiter, handleStartEditCommitSession);
router.post(
	"/commit/external-check",
	timetableImportMutationLimiter,
	handleExternalCommitCheck,
);
router.post(
	"/commit/external-resolve",
	timetableImportMutationLimiter,
	handleExternalCommitResolve,
);
router.post(
	"/commit/internal-check",
	timetableImportMutationLimiter,
	handleInternalCommitCheck,
);
router.post(
	"/commit/internal-resolve",
	timetableImportMutationLimiter,
	handleInternalCommitResolve,
);
router.post("/commit/freeze", timetableImportCommitLimiter, handleStartCommitFreeze);
router.post(
	"/commit/runtime-check",
	timetableImportMutationLimiter,
	handleRuntimeCommitCheck,
);
router.post(
	"/commit/runtime-resolve",
	timetableImportMutationLimiter,
	handleRuntimeCommitResolve,
);
router.post("/commit/finalize", timetableImportCommitLimiter, handleFinalizeCommitSession);
router.post("/commit/cancel", timetableImportMutationLimiter, handleCancelCommitSession);
router.get("/commit/:id/status", timetableImportReadLimiter, handleGetCommitSessionStatus);

// Slot system change workspace
router.post(
	"/slot-systems/:id/preview-changes",
	timetableImportMutationLimiter,
	handlePreviewSlotSystemChanges,
);
router.post(
	"/slot-systems/:id/apply-changes",
	timetableImportCommitLimiter,
	handleApplySlotSystemChanges,
);

export default router;