import { Router } from 'express';
import { authMiddleware } from '../../../middleware/auth';
import { requireRole } from '../../../middleware/rbac';
import { validate } from '../../../api/middleware/validation.middleware';
import { RoomsController } from './controllers/rooms.controller';
import {
  createRoomSchema,
  updateRoomSchema,
  listRoomsSchema,
  roomAvailabilitySchema,
  roomDayAvailabilitySchema,
} from '../../../shared/validators/schemas/room.schemas';
import { idParamSchema } from '../../../shared/validators/schemas/common.schemas';

const router = Router();
const controller = new RoomsController();

router.get(
  '/',
  authMiddleware,
  validate({ query: listRoomsSchema }),
  (req, res, next) => {
    controller.list(req, res).catch(next);
  }
);

router.get(
  '/:id/availability/day/timeline',
  authMiddleware,
  validate({ params: idParamSchema, query: roomDayAvailabilitySchema }),
  (req, res, next) => {
    controller.getRoomDayAvailabilityTimeline(req, res).catch(next);
  }
);

router.get(
  '/:id/availability/day',
  authMiddleware,
  validate({ params: idParamSchema, query: roomDayAvailabilitySchema }),
  (req, res, next) => {
    controller.getRoomDayAvailability(req, res).catch(next);
  }
);

router.get(
  '/:id/availability',
  authMiddleware,
  validate({ params: idParamSchema, query: roomAvailabilitySchema }),
  (req, res, next) => {
    controller.getAvailability(req, res).catch(next);
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
  requireRole(['ADMIN', 'STAFF']),
  validate({ body: createRoomSchema }),
  (req, res, next) => {
    controller.create(req, res).catch(next);
  }
);

router.patch(
  '/:id',
  authMiddleware,
  requireRole(['ADMIN', 'STAFF']),
  validate({ params: idParamSchema, body: updateRoomSchema }),
  (req, res, next) => {
    controller.update(req, res).catch(next);
  }
);

router.delete(
  '/:id',
  authMiddleware,
  requireRole(['ADMIN', 'STAFF']),
  validate({ params: idParamSchema }),
  (req, res, next) => {
    controller.delete(req, res).catch(next);
  }
);

export default router;