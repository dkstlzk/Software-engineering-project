import { Router } from 'express';
import { authMiddleware } from '../../../middleware/auth';
import { requireRole } from '../../../middleware/rbac';
import { validate } from '../../../api/middleware/validation.middleware';
import { BuildingsController } from './controllers/buildings.controller';
import {
  createBuildingSchema,
  updateBuildingSchema,
} from '../../../shared/validators/schemas/building.schemas';
import { idParamSchema } from '../../../shared/validators/schemas/common.schemas';

const router = Router();
const controller = new BuildingsController();

router.get(
  '/',
  authMiddleware,
  (req, res, next) => {
    controller.list(req, res).catch(next);
  }
);

router.get(
  '/:id/rooms',
  authMiddleware,
  validate({ params: idParamSchema }),
  (req, res, next) => {
    controller.getRooms(req, res).catch(next);
  }
);

router.get(
  '/:id',
  authMiddleware,
  validate({ params: idParamSchema }),
  (req, res, next) => {
    controller.getById(req, res).catch(next);
  }
);

router.post(
  '/',
  authMiddleware,
  requireRole('ADMIN'),
  validate({ body: createBuildingSchema }),
  (req, res, next) => {
    controller.create(req, res).catch(next);
  }
);

router.patch(
  '/:id',
  authMiddleware,
  requireRole(['ADMIN', 'STAFF']),
  validate({ params: idParamSchema, body: updateBuildingSchema }),
  (req, res, next) => {
    controller.update(req, res).catch(next);
  }
);

router.delete(
  '/:id',
  authMiddleware,
  requireRole(['ADMIN']),
  validate({ params: idParamSchema }),
  (req, res, next) => {
    controller.delete(req, res).catch(next);
  }
);

export default router;