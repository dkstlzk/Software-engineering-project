import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  let dbSelectQueue: unknown[][] = [];
  let txSelectQueue: unknown[][] = [];
  let txUpdateReturningQueue: unknown[][] = [];

  const createBookingMock = vi.fn();
  const hasBookingOverlapMock = vi.fn();
  const getAssignedBuildingIdsForStaffMock = vi.fn();
  const sendRoleAwareNotificationsMock = vi.fn();

  function createSelectChain(queue: unknown[][]) {
    return {
      from() {
        return {
          innerJoin() {
            return {
              where() {
                return {
                  limit: async () => queue.shift() ?? [],
                };
              },
            };
          },
          where() {
            return {
              limit: async () => queue.shift() ?? [],
            };
          },
        };
      },
    };
  }

  const txMock = {
    select: vi.fn(() => createSelectChain(txSelectQueue)),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => txUpdateReturningQueue.shift() ?? []),
        })),
      })),
    })),
  };

  const dbMock = {
    select: vi.fn(() => createSelectChain(dbSelectQueue)),
    transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
  };

  const setQueues = (dbQueue: unknown[][], txQueue: unknown[][], updateQueue: unknown[][]) => {
    dbSelectQueue = dbQueue;
    txSelectQueue = txQueue;
    txUpdateReturningQueue = updateQueue;
  };

  return {
    createBookingMock,
    hasBookingOverlapMock,
    getAssignedBuildingIdsForStaffMock,
    sendRoleAwareNotificationsMock,
    dbMock,
    setQueues,
  };
});

vi.mock('../../../db', () => ({
  db: testState.dbMock,
}));

vi.mock('../../../middleware/auth', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    (req as express.Request & { user?: { id: number; role: 'STAFF' } }).user = {
      id: 7,
      role: 'STAFF',
    };
    next();
  },
}));

vi.mock('../../../middleware/rbac', () => ({
  requireRole: () =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}));

vi.mock('../../../middleware/bookingFreeze', () => ({
  requireBookingsUnfrozen: () =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}));

vi.mock('../../bookings/services/bookingService', () => ({
  createBooking: testState.createBookingMock,
  hasBookingOverlap: testState.hasBookingOverlapMock,
}));

vi.mock('../../users/services/staffBuildingScope', () => ({
  getAssignedBuildingIdsForStaff: testState.getAssignedBuildingIdsForStaffMock,
}));

vi.mock('../../notifications/services/notificationService', () => ({
  getActiveAdminIds: vi.fn(async () => []),
  getActiveStaffIdsForBuilding: vi.fn(async () => []),
  sendRoleAwareNotifications: testState.sendRoleAwareNotificationsMock,
}));

import bookingRequestsRouter from '../api/router';

function buildPendingRequest() {
  return {
    id: 1,
    userId: 11,
    facultyId: 12,
    roomId: 99,
    startAt: new Date('2026-04-10T10:00:00.000Z'),
    endAt: new Date('2026-04-10T11:00:00.000Z'),
    status: 'PENDING_STAFF',
  };
}

describe('POST /booking-requests/:id/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const pendingRequest = buildPendingRequest();
    testState.setQueues(
      [[{ request: pendingRequest, buildingId: 10 }]],
      [[pendingRequest]],
      [[{ id: 1 }]],
    );

    testState.getAssignedBuildingIdsForStaffMock.mockResolvedValue([10]);
    testState.hasBookingOverlapMock.mockResolvedValue(false);
    testState.createBookingMock.mockResolvedValue({
      ok: true,
      booking: {
        id: 501,
        roomId: 99,
        startAt: pendingRequest.startAt,
        endAt: pendingRequest.endAt,
        requestId: 1,
        approvedBy: 7,
        approvedAt: new Date('2026-04-10T09:59:00.000Z'),
        source: 'MANUAL_REQUEST',
        sourceRef: 'request:1',
      },
    });
    testState.sendRoleAwareNotificationsMock.mockResolvedValue(undefined);
  });

  it('approves a pending request when no overlap exists', async () => {
    const app = express();
    app.use(express.json());
    app.use('/booking-requests', bookingRequestsRouter);

    const response = await request(app)
      .post('/booking-requests/1/approve')
      .send({ courseId: 33 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 501, requestId: 1, roomId: 99 });
    expect(testState.hasBookingOverlapMock).toHaveBeenCalled();
    expect(testState.createBookingMock).toHaveBeenCalled();
    expect(testState.dbMock.transaction).toHaveBeenCalledOnce();
  });

  it('rejects approval when overlap is detected during transaction recheck', async () => {
    testState.hasBookingOverlapMock.mockResolvedValue(true);

    const app = express();
    app.use(express.json());
    app.use('/booking-requests', bookingRequestsRouter);

    const response = await request(app)
      .post('/booking-requests/1/approve')
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('Room already booked');
    expect(testState.createBookingMock).not.toHaveBeenCalled();
  });
});
