import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  createBuilding,
  deleteBuilding,
  getBuildings,
  updateBuilding,
} from "../api/api";
import type { Building } from "../api/api";

export function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadBuildings = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getBuildings();
      setBuildings(result);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Failed to load buildings";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBuildings();
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createBuilding(trimmedName);
      setNewName("");
      await loadBuildings();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Failed to create building";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (id: number) => {
    const trimmedName = editingName.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      await updateBuilding(id, trimmedName);
      setEditingId(null);
      setEditingName("");
      await loadBuildings();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Failed to update building";
      setError(message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setError(null);

    try {
      await deleteBuilding(id);
      await loadBuildings();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Failed to delete building";
      setError(message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section>
      <h2>Buildings</h2>

      <form className="panel" onSubmit={handleCreate}>
        <h3>Add Building</h3>
        <label htmlFor="newBuildingName">Name</label>
        <input
          id="newBuildingName"
          type="text"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Enter building name"
          disabled={isSubmitting}
        />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Adding..." : "Add Building"}
        </button>
      </form>

      {error ? <p className="error">Error: {error}</p> : null}
      {loading ? <p>Loading buildings...</p> : null}

      {!loading && buildings.length === 0 ? <p>No buildings found.</p> : null}

      {!loading && buildings.length > 0 ? (
        <ul className="list panel">
          {buildings.map((building) => {
            const isEditing = editingId === building.id;
            const isDeleting = deletingId === building.id;

            return (
              <li key={building.id}>
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
                      onClick={() => void handleUpdate(building.id)}
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
                      #{building.id} - {building.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(building.id);
                        setEditingName(building.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => void handleDelete(building.id)}
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