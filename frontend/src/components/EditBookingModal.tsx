import { useEffect, useMemo, useState } from 'react';
import { DateInput } from './DateInput';
import type { Booking, Room, Building } from '../lib/api';
import { formatRoomDisplayWithBuildingsArray } from '../utils/room';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';

type EditBookingModalProps = {
  open: boolean;
  booking: Booking | null;
  rooms: Room[];
  buildings: Building[];
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: { newRoomId?: number; newStartAt?: string; newEndAt?: string }) => Promise<void>;
};

export function EditBookingModal({
  open,
  booking,
  rooms,
  buildings,
  isSubmitting,
  error,
  onClose,
  onSubmit,
}: EditBookingModalProps) {
  const [newRoomId, setNewRoomId] = useState<number | ''>('');
  const [newStartAt, setNewStartAt] = useState('');
  const [newEndAt, setNewEndAt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!booking) {
      return;
    }

    setNewRoomId(booking.roomId);
    setNewStartAt(booking.startAt.slice(0, 16));
    setNewEndAt(booking.endAt.slice(0, 16));
    setFormError(null);
  }, [booking, open]);

  const hasChanges = useMemo(() => {
    if (!booking) {
      return false;
    }

    const normalizedStart = booking.startAt.slice(0, 16);
    const normalizedEnd = booking.endAt.slice(0, 16);

    return (
      newRoomId !== booking.roomId ||
      newStartAt !== normalizedStart ||
      newEndAt !== normalizedEnd
    );
  }, [booking, newEndAt, newRoomId, newStartAt]);

  const handleSubmit = async () => {
    if (!booking) {
      return;
    }

    if (newRoomId === '') {
      setFormError('Room is required');
      return;
    }

    if (!newStartAt || !newEndAt) {
      setFormError('Start and end times are required');
      return;
    }

    if (new Date(newStartAt) >= new Date(newEndAt)) {
      setFormError('Start time must be before end time');
      return;
    }

    const payload: { newRoomId?: number; newStartAt?: string; newEndAt?: string } = {};

    if (newRoomId !== booking.roomId) {
      payload.newRoomId = Number(newRoomId);
    }

    if (newStartAt !== booking.startAt.slice(0, 16)) {
      payload.newStartAt = newStartAt;
    }

    if (newEndAt !== booking.endAt.slice(0, 16)) {
      payload.newEndAt = newEndAt;
    }

    if (Object.keys(payload).length === 0) {
      setFormError('No changes to submit');
      return;
    }

    setFormError(null);
    await onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Booking</DialogTitle>
          <DialogDescription>
            Update room and/or timing for this booking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="editBookingRoom">Room</Label>
            <select
              id="editBookingRoom"
              className="input"
              value={newRoomId}
              onChange={(e) => setNewRoomId(e.target.value === '' ? '' : Number(e.target.value))}
              disabled={isSubmitting}
            >
              <option value="">Select a room</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {formatRoomDisplayWithBuildingsArray(room, buildings)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="editBookingStartAt">Start</Label>
              <DateInput
                id="editBookingStartAt"
                mode="datetime"
                value={newStartAt}
                onChange={setNewStartAt}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editBookingEndAt">End</Label>
              <DateInput
                id="editBookingEndAt"
                mode="datetime"
                value={newEndAt}
                onChange={setNewEndAt}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {(formError || error) && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-md text-sm">
              {formError ?? error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting || !hasChanges}>
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
