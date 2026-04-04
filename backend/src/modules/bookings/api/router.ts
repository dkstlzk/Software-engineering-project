import { Router } from 'express';
import { authMiddleware } from '../../../middleware/auth';
import { requireRole } from '../../../middleware/rbac';
import { requireBookingsUnfrozen } from '../../../middleware/bookingFreeze';
import { validate } from '../../../api/middleware/validation.middleware';
import { idParamSchema } from '../../../shared/validators/schemas/common.schemas';
import {
  createBookingSchema,
  updateBookingSchema,
  editBookingSchema,
  listBookingsSchema,
  bulkCreateBookingSchema,
  pruneBookingsSchema,
} from '../../../shared/validators/schemas/booking.schemas';
import { BookingsController } from './controllers/bookings.controller';

const router = Router();
const controller = new BookingsController();

router.get('/', authMiddleware, validate({ query: listBookingsSchema }), (req, res, next) => {
  controller.list(req, res).catch(next);
});

router.get('/:id', authMiddleware, validate({ params: idParamSchema }), (req, res, next) => {
  controller.getById(req, res).catch(next);
});

router.post(
  '/',
  authMiddleware,
  requireRole(['ADMIN', 'STAFF']),
  requireBookingsUnfrozen(),
  validate({ body: createBookingSchema }),
  (req, res, next) => {
    controller.create(req, res).catch(next);
  }
);

router.post(
  '/bulk',
  authMiddleware,
  requireRole(['ADMIN', 'STAFF']),
  requireBookingsUnfrozen(),
  validate({ body: bulkCreateBookingSchema }),
  (req, res, next) => {
    controller.bulkCreate(req, res).catch(next);
  }
);

router.patch(
  '/:id',
  authMiddleware,
  requireRole(['ADMIN', 'STAFF']),
  requireBookingsUnfrozen(),
  validate({ params: idParamSchema, body: updateBookingSchema }),
  (req, res, next) => {
    controller.update(req, res).catch(next);
  }
);

router.post(
  '/:id/edit',
  authMiddleware,
  requireRole(['ADMIN', 'STAFF', 'FACULTY', 'STUDENT']),
  requireBookingsUnfrozen(),
  validate({ params: idParamSchema, body: editBookingSchema }),
  (req, res, next) => {
    controller.edit(req, res).catch(next);
  }
);

router.delete(
  '/prune',
  authMiddleware,
  requireRole('ADMIN'),
  requireBookingsUnfrozen(),
  validate({ query: pruneBookingsSchema }),
  (req, res, next) => {
    controller.prune(req, res).catch(next);
  }
);

router.delete('/:id', authMiddleware, requireRole(['ADMIN', 'STAFF']), requireBookingsUnfrozen(), validate({ params: idParamSchema }), (req, res, next) => {
  controller.delete(req, res).catch(next);
});

export default router;
