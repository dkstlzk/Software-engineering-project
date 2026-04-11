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
import {
  useCreateBuilding,
  useUpdateBuilding,
} from "../../hooks/useBuildings";
import type { Building } from "../../lib/api/types";
import { formatError } from "../../utils/formatError";

const buildingSchema = z.object({
  name: z.string().min(1, "Building name is required").max(100),
  location: z.string().max(500).optional(),
});

type BuildingFormData = z.infer<typeof buildingSchema>;

interface BuildingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  building?: Building | null;
  canView?: boolean;
}

export function BuildingFormDialog({
  open,
  onOpenChange,
  building,
  canView = true,
}: BuildingFormDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const createMutation = useCreateBuilding();
  const updateMutation = useUpdateBuilding();
  const isLoading = createMutation.isPending || updateMutation.isPending;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BuildingFormData>({
    resolver: zodResolver(buildingSchema),
    defaultValues: {
      name: building?.name || "",
      location: building?.location || "",
    },
  });

  // Reset form when building changes
  useEffect(() => {
    if (open) {
      reset({
        name: building?.name || "",
        location: building?.location || "",
      });
    }
  }, [open, building, reset]);

  if (!canView) {
    return null;
  }

  const onSubmit = async (data: BuildingFormData) => {
    try {
      setError(null);
      if (building?.id) {
        await updateMutation.mutateAsync({
          id: building.id,
          name: data.name,
          location: data.location || null,
        });
      } else {
        await createMutation.mutateAsync({
          name: data.name,
          location: data.location || null,
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {building ? "Edit Building" : "Add Building"}
          </DialogTitle>
          <DialogDescription>
            {building
              ? "Update the building details"
              : "Enter the building name and location"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Building Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Main Campus Building"
              {...register("name")}
              disabled={isLoading}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Textarea
              id="location"
              placeholder="e.g., North Campus, near the library..."
              {...register("location")}
              disabled={isLoading}
              rows={2}
            />
            {errors.location && (
              <p className="text-sm text-red-500">{errors.location.message}</p>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : building ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
