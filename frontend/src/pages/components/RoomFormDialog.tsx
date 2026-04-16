import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useCreateRoom, useUpdateRoom } from "../../hooks/useRooms";
import { useBuildings } from "../../hooks/useBuildings";
import type { Building, Room, RoomType } from "../../lib/api/types";
import { formatError } from "../../utils/formatError";

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: "LECTURE_HALL", label: "Lecture Hall" },
  { value: "CLASSROOM", label: "Classroom" },
  { value: "SEMINAR_ROOM", label: "Seminar Room" },
  { value: "COMPUTER_LAB", label: "Computer Lab" },
  { value: "CONFERENCE_ROOM", label: "Conference Room" },
  { value: "AUDITORIUM", label: "Auditorium" },
  { value: "WORKSHOP", label: "Workshop" },
  { value: "OTHER", label: "Other" },
];

const roomSchema = z.object({
  name: z.string().min(1, "Room name is required").max(100),
  buildingId: z.coerce.number().int("Building is required").positive(),
  capacity: z
    .string()
    .transform(v => v.trim())
    .transform(v => v === "" ? null : v)
    .pipe(
      z.union([
        z.literal(null),
        z.coerce.number().int().positive("Capacity must be a positive number"),
      ])
    )
    .nullable(),
  roomType: z.enum([
    "LECTURE_HALL",
    "CLASSROOM",
    "SEMINAR_ROOM",
    "COMPUTER_LAB",
    "CONFERENCE_ROOM",
    "AUDITORIUM",
    "WORKSHOP",
    "OTHER",
  ]).optional(),
  hasProjector: z.boolean().optional(),
  hasMic: z.boolean().optional(),
  accessible: z.boolean().optional(),
  equipmentList: z.string().optional(),
});

type RoomFormData = z.infer<typeof roomSchema>;

interface RoomFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room?: Room | null;
  defaultBuildingId?: number;
}

export function RoomFormDialog({
  open,
  onOpenChange,
  room,
  defaultBuildingId,
}: RoomFormDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const { data: buildings = [] } = useBuildings();
  const createMutation = useCreateRoom();
  const updateMutation = useUpdateRoom();
  const isLoading = createMutation.isPending || updateMutation.isPending;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    watch,
    setValue,
  } = useForm<RoomFormData>({
    resolver: zodResolver(roomSchema),
    mode: 'onChange',
    defaultValues: {
      name: room?.name || "",
      buildingId: room?.buildingId || defaultBuildingId || undefined,
      capacity: room?.capacity ? String(room.capacity) : ("" as any),
      roomType: room?.roomType || "OTHER",
      hasProjector: room?.hasProjector || false,
      hasMic: room?.hasMic || false,
      accessible: room?.accessible ?? true,
      equipmentList: room?.equipmentList || "",
    },
  });

  // Reset form when room changes
  useEffect(() => {
    if (open) {
      reset({
        name: room?.name || "",
        buildingId: room?.buildingId || defaultBuildingId || undefined,
        capacity: room?.capacity ? String(room.capacity) : ("" as any),
        roomType: room?.roomType || "OTHER",
        hasProjector: room?.hasProjector || false,
        hasMic: room?.hasMic || false,
        accessible: room?.accessible ?? true,
        equipmentList: room?.equipmentList || "",
      });
    }
  }, [open, room, defaultBuildingId, reset]);

  const buildingId = watch("buildingId");
  const roomType = watch("roomType");
  const hasProjector = watch("hasProjector");
  const hasMic = watch("hasMic");
  const accessible = watch("accessible");

  const onSubmit = async (data: RoomFormData) => {
    try {
      setError(null);
      const capacityValue = data.capacity === null || data.capacity === undefined
        ? null
        : data.capacity;

      if (room?.id) {
        await updateMutation.mutateAsync({
          id: room.id,
          name: data.name,
          capacity: capacityValue,
          roomType: data.roomType,
          hasProjector: data.hasProjector,
          hasMic: data.hasMic,
          accessible: data.accessible,
          equipmentList: data.equipmentList || null,
        });
      } else {
        await createMutation.mutateAsync({
          name: data.name,
          buildingId: data.buildingId,
          capacity: capacityValue,
          roomType: data.roomType,
          hasProjector: data.hasProjector,
          hasMic: data.hasMic,
          accessible: data.accessible,
          equipmentList: data.equipmentList || null,
        });
      }
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(formatError(err, "An error occurred"));
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      reset();
      setError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{room ? "Edit Room" : "Add Room"}</DialogTitle>
          <DialogDescription>
            {room
              ? "Update the room details"
              : "Enter the room details and select a building"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Basic Info */}
          <div className="space-y-2">
            <Label htmlFor="name">Room Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Room 101"
              {...register("name")}
              disabled={isLoading}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          {!room && (
            <div className="space-y-2">
              <Label htmlFor="building">Building *</Label>
              <Select
                value={buildingId?.toString() || ""}
                onValueChange={(value) => setValue("buildingId", Number(value))}
              >
                <SelectTrigger disabled={isLoading}>
                  <SelectValue placeholder="Select a building" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((building: Building) => (
                    <SelectItem key={building.id} value={building.id.toString()}>
                      {building.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.buildingId && (
                <p className="text-sm text-red-500">
                  {errors.buildingId.message}
                </p>
              )}
            </div>
          )}

          {/* Room Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                type="number"
                min="1"
                placeholder="e.g., 50 (leave blank for no capacity)"
                {...register("capacity")}
                disabled={isLoading}
              />
              {errors.capacity && (
                <p className="text-sm text-red-500">
                  {typeof errors.capacity.message === "string" 
                    ? errors.capacity.message 
                    : "Invalid capacity"}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="roomType">Room Type</Label>
              <Select
                value={roomType || "OTHER"}
                onValueChange={(value) => setValue("roomType", value as RoomType)}
              >
                <SelectTrigger disabled={isLoading}>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Equipment & Features */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Features</Label>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasProjector"
                  checked={hasProjector}
                  onCheckedChange={(checked) => setValue("hasProjector", checked === true)}
                  disabled={isLoading}
                />
                <Label htmlFor="hasProjector" className="text-sm font-normal cursor-pointer">
                  Projector
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasMic"
                  checked={hasMic}
                  onCheckedChange={(checked) => setValue("hasMic", checked === true)}
                  disabled={isLoading}
                />
                <Label htmlFor="hasMic" className="text-sm font-normal cursor-pointer">
                  Microphone
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="accessible"
                  checked={accessible}
                  onCheckedChange={(checked) => setValue("accessible", checked === true)}
                  disabled={isLoading}
                />
                <Label htmlFor="accessible" className="text-sm font-normal cursor-pointer">
                  Available for Booking
                </Label>
              </div>
            </div>
            {!accessible && (
              <p className="text-sm text-amber-600">
                Warning: This room will not accept new booking requests while unavailable.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="equipmentList">Additional Equipment</Label>
            <Textarea
              id="equipmentList"
              placeholder="e.g., Whiteboard, Air conditioning, WiFi..."
              {...register("equipmentList")}
              disabled={isLoading}
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : room ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
