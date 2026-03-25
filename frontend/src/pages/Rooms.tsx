import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  createRoom,
  deleteRoom,
  getBuildings,
  getRooms,
  updateRoom,
} from "../api/api";
import type { Building, Room } from "../api/api";

export function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | "all">("all");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newBuildingId, setNewBuildingId] = useState<number | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const buildingNameById = new Map(buildings.map((building) => [building.id, building.name]));

  const loadBuildings = async () => {
    try {
      const result = await getBuildings();
      setBuildings(result);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Failed to load buildings";
      setError(message);
    }
  };

  const loadRooms = async (buildingId: number | "all") => {
    setLoading(true);
    setError(null);

    try {
      const result = await getRooms(buildingId === "all" ? undefined : buildingId);
      setRooms(result);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to load rooms";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await loadBuildings();
      await loadRooms("all");
    })();
  }, []);

  const handleFilterChange = async (value: string) => {
    const nextFilter = value === "all" ? "all" : Number(value);
    setSelectedBuildingId(nextFilter);
    await loadRooms(nextFilter);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setError("Room name is required");
      return;
    }

    if (newBuildingId === "") {
      setError("Building is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createRoom(trimmedName, newBuildingId);
      setNewName("");
      await loadRooms(selectedBuildingId);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to create room";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (id: number) => {
    const trimmedName = editingName.trim();
    if (!trimmedName) {
      setError("Room name is required");
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      await updateRoom(id, trimmedName);
      setEditingId(null);
      setEditingName("");
      await loadRooms(selectedBuildingId);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to update room";
      setError(message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setError(null);

    try {
      await deleteRoom(id);
      await loadRooms(selectedBuildingId);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Failed to delete room";
      setError(message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section>
      <h2>Rooms</h2>

      <div className="panel">
        <h3>Filter Rooms</h3>
        <label htmlFor="roomBuildingFilter">Building</label>
        <select
          id="roomBuildingFilter"
          value={selectedBuildingId}
          onChange={(event) => void handleFilterChange(event.target.value)}
        >
          <option value="all">All Buildings</option>
          {buildings.map((building) => (
            <option key={building.id} value={building.id}>
              {building.name}
            </option>
          ))}
        </select>
      </div>

      <form className="panel" onSubmit={handleCreate}>
        <h3>Add Room</h3>
        <label htmlFor="newRoomName">Room Name</label>
        <input
          id="newRoomName"
          type="text"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Enter room name"
          disabled={isSubmitting}
        />

        <label htmlFor="newRoomBuilding">Building</label>
        <select
          id="newRoomBuilding"
          value={newBuildingId}
          onChange={(event) => setNewBuildingId(event.target.value === "" ? "" : Number(event.target.value))}
          disabled={isSubmitting}
        >
          <option value="">Select a building</option>
          {buildings.map((building) => (
            <option key={building.id} value={building.id}>
              {building.name}
            </option>
          ))}
        </select>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Adding..." : "Add Room"}
        </button>
      </form>

      {error ? <p className="error">Error: {error}</p> : null}
      {loading ? <p>Loading rooms...</p> : null}

      {!loading && rooms.length === 0 ? <p>No rooms found.</p> : null}

      {!loading && rooms.length > 0 ? (
        <ul className="list panel">
          {rooms.map((room) => {
            const isEditing = editingId === room.id;
            const isDeleting = deletingId === room.id;

            return (
              <li key={room.id}>
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      disabled={isUpdating}
                    />
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => void handleUpdate(room.id)}
                    >
                      {isUpdating ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => {
                        setEditingId(null);
                        setEditingName("");
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span>
                      #{room.id} - {room.name} (Building: {buildingNameById.get(room.buildingId) ?? room.buildingId})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(room.id);
                        setEditingName(room.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => void handleDelete(room.id)}
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}