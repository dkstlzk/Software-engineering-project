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
} from "./controller";
import { authMiddleware } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import multer from "multer";

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

router.get("/imports", handleListImportBatches);
router.post("/imports/preview", upload.single("file"), handlePreviewImport);
router.get("/imports/:id", handleGetImportBatch);
router.put("/imports/:id/decisions", handleSaveImportDecisions);
router.post("/imports/:id/reallocate", handleReallocateImport);
router.post("/imports/:id/commit", handleCommitImport);
router.delete("/imports/:id", handleDeleteImportBatch);
router.get("/imports/:id/processed-rows", handleGetProcessedImportRows);

export default router;