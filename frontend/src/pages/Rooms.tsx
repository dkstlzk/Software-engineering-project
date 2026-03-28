import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import {
  createBuilding,
  createRoom,
  deleteBuilding,
  deleteRoom,
  getBuildings,
  getRooms,
  updateBuilding,
  updateRoom,
} from "../api/api";
import type { Building, Room } from "../api/api";
import { useAuth } from "../auth/AuthContext";

type IconButtonVariant = "primary" | "danger" | "ghost";

type IconButtonProps = {
  type?: "button" | "submit";
  label: string;
  title?: string;
  variant?: IconButtonVariant;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
};

function IconButton({
  type = "button",
  label,
  title,
  variant = "ghost",
  disabled,
  onClick,
  className,
  children,
}: IconButtonProps) {
  const classes = `icon-btn icon-btn-${variant}${className ? ` ${className}` : ""}`;

  return (
    <button
      type={type}
      className={classes}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" fill="currentColor" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 20h4l10-10-4-4L4 16v4zm12.7-12.3 1.6-1.6a1 1 0 0 0 0-1.4l-1.3-1.3a1 1 0 0 0-1.4 0L14 4.9l2.7 2.8z"
        fill="currentColor"
      />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M18.3 5.7 17 4.4 12 9.4 7 4.4 5.7 5.7l5 5-5 5L7 17l5-5 5 5 1.3-1.3-5-5z"
        fill="currentColor"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 4h10l-1 2h4v2h-2l-1 12H7L6 8H4V6h4L7 4zm2 4v10h2V8H9zm4 0v10h2V8h-2z"
        fill="currentColor"
      />
    </svg>
  );
}

export function RoomsPage() {
  const { user } = useAuth();
  const canMutate = user?.role === "ADMIN" || user?.role === "STAFF";

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeBuildingId, setActiveBuildingId] = useState<number | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<number | "">("");

  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newBuildingName, setNewBuildingName] = useState("");
  const [isCreatingBuilding, setIsCreatingBuilding] = useState(false);
  const [editingBuildingId, setEditingBuildingId] = useState<number | null>(null);
  const [editingBuildingName, setEditingBuildingName] = useState("");
  const [isUpdatingBuilding, setIsUpdatingBuilding] = useState(false);
  const [deletingBuildingId, setDeletingBuildingId] = useState<number | null>(null);

  const [newRoomName, setNewRoomName] = useState("");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [editingRoomName, setEditingRoomName] = useState("");
  const [isUpdatingRoom, setIsUpdatingRoom] = useState(false);
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);

  const activeBuilding = useMemo(
    () => buildings.find((building) => building.id === activeBuildingId) ?? null,
    [activeBuildingId, buildings],
  );

  const loadBuildings = async (): Promise<Building[]> => {
    const loadedBuildings = await getBuildings();
    setBuildings(loadedBuildings);
    return loadedBuildings;
  };

  const loadRoomsForBuilding = async (buildingId: number): Promise<Room[]> => {
    const loadedRooms = await getRooms(buildingId);
    setRooms(loadedRooms);
    return loadedRooms;
  };

  useEffect(() => {
    void (async () => {
      setLoadingBuildings(true);
      setError(null);
      try {
        await loadBuildings();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load buildings");
      } finally {
        setLoadingBuildings(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedRoomId === "") {
      setEditingRoomName("");
      return;
    }

    const selectedRoom = rooms.find((room) => room.id === selectedRoomId);
    setEditingRoomName(selectedRoom ? selectedRoom.name : "");
  }, [rooms, selectedRoomId]);

  const closeRoomsModal = useCallback(() => {
    setActiveBuildingId(null);
    setSelectedRoomId("");
    setRooms([]);
    setEditingRoomName("");
  }, []);

  useEffect(() => {
    if (!activeBuilding) {
      return;
    }

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRoomsModal();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [activeBuilding, closeRoomsModal]);

  const openRoomsModal = async (buildingId: number) => {
    setActiveBuildingId(buildingId);
    setSelectedRoomId("");
    setError(null);

    setLoadingRooms(true);
    try {
      await loadRoomsForBuilding(buildingId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load rooms");
    } finally {
      setLoadingRooms(false);
    }
  };

  const handleBuildingKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    buildingId: number,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    void openRoomsModal(buildingId);
  };

  const handleCreateBuilding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = newBuildingName.trim();
    if (!trimmed) {
      setError("Building name is required");
      return;
    }

    setIsCreatingBuilding(true);
    setError(null);
    try {
      const created = await createBuilding(trimmed);
      setNewBuildingName("");
      await loadBuildings();
      await openRoomsModal(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create building");
    } finally {
      setIsCreatingBuilding(false);
    }
  };

  const handleUpdateBuilding = async (id: number) => {
    const trimmed = editingBuildingName.trim();
    if (!trimmed) {
      setError("Building name is required");
      return;
    }

    setIsUpdatingBuilding(true);
    setError(null);
    try {
      await updateBuilding(id, trimmed);
      setEditingBuildingId(null);
      setEditingBuildingName("");
      await loadBuildings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update building");
    } finally {
      setIsUpdatingBuilding(false);
    }
  };

  const handleDeleteBuilding = async (id: number) => {
    const deletedActiveBuilding = activeBuildingId === id;

    setDeletingBuildingId(id);
    setError(null);
    try {
      await deleteBuilding(id);

      setEditingBuildingId(null);
      setEditingBuildingName("");

      if (deletedActiveBuilding) {
        closeRoomsModal();
      }

      await loadBuildings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete building");
    } finally {
      setDeletingBuildingId(null);
    }
  };

  const handleCreateRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activeBuilding) {
      setError("Select a building first");
      return;
    }

    const trimmed = newRoomName.trim();
    if (!trimmed) {
      setError("Room name is required");
      return;
    }

    setIsCreatingRoom(true);
    setError(null);
    try {
      const created = await createRoom(trimmed, activeBuilding.id);
      setNewRoomName("");
      const loadedRooms = await loadRoomsForBuilding(activeBuilding.id);
      const createdRoomExists = loadedRooms.some((room) => room.id === created.id);
      setSelectedRoomId(createdRoomExists ? created.id : loadedRooms[0]?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create room");
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleUpdateRoom = async () => {
    if (!activeBuilding || selectedRoomId === "") {
      setError("Select a room first");
      return;
    }

    const trimmed = editingRoomName.trim();
    if (!trimmed) {
      setError("Room name is required");
      return;
    }

    setIsUpdatingRoom(true);
    setError(null);
    try {
      await updateRoom(selectedRoomId, trimmed);
      await loadRoomsForBuilding(activeBuilding.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update room");
    } finally {
      setIsUpdatingRoom(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!activeBuilding || selectedRoomId === "") {
      setError("Select a room first");
      return;
    }

    setIsDeletingRoom(true);
    setError(null);
    try {
      await deleteRoom(selectedRoomId);
      await loadRoomsForBuilding(activeBuilding.id);
      setSelectedRoomId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete room");
    } finally {
      setIsDeletingRoom(false);
    }
  };

  return (
    <section>
      <div className="page-header">
        <h2>Rooms</h2>
        <p>All buildings in one list. Click a building to manage its rooms in a popup.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <h3>Buildings</h3>
        </div>

        {canMutate && (
          <form className="section-gap" onSubmit={handleCreateBuilding}>
            <div className="icon-input-row">
              <div className="form-field">
                <label htmlFor="newBuildingName">Building name</label>
                <input
                  id="newBuildingName"
                  className="input"
                  type="text"
                  value={newBuildingName}
                  onChange={(e) => setNewBuildingName(e.target.value)}
                  placeholder="e.g. Science Block A"
                  disabled={isCreatingBuilding}
                />
              </div>
              <IconButton
                type="submit"
                variant="primary"
                label="Add building"
                disabled={isCreatingBuilding}
                className="icon-input-submit"
              >
                <PlusIcon />
              </IconButton>
            </div>
          </form>
        )}

        {loadingBuildings && <p className="loading-text">Loading buildings...</p>}
        {!loadingBuildings && buildings.length === 0 && <p className="empty-text">No buildings found.</p>}

        {buildings.length > 0 && (
          <div className="data-list">
            {buildings.map((building) => {
              const isEditing = editingBuildingId === building.id;
              const isDeleting = deletingBuildingId === building.id;

              return (
                <div className="data-item building-item" key={building.id}>
                  {isEditing ? (
                    <div className="inline-edit">
                      <input
                        className="input"
                        type="text"
                        value={editingBuildingName}
                        onChange={(e) => setEditingBuildingName(e.target.value)}
                        disabled={isUpdatingBuilding}
                        autoFocus
                      />
                      <IconButton
                        variant="primary"
                        label="Save building name"
                        disabled={isUpdatingBuilding}
                        onClick={() => void handleUpdateBuilding(building.id)}
                      >
                        <SaveIcon />
                      </IconButton>
                      <IconButton
                        variant="ghost"
                        label="Cancel building rename"
                        disabled={isUpdatingBuilding}
                        onClick={() => {
                          setEditingBuildingId(null);
                          setEditingBuildingName("");
                        }}
                      >
                        <CancelIcon />
                      </IconButton>
                    </div>
                  ) : (
                    <>
                      <div
                        className="building-item-main"
                        role="button"
                        tabIndex={0}
                        onClick={() => void openRoomsModal(building.id)}
                        onKeyDown={(event) => handleBuildingKeyDown(event, building.id)}
                      >
                        <div className="data-item-content">
                          <div className="data-item-title">{building.name}</div>
                          <div className="data-item-subtitle">Click to manage rooms</div>
                        </div>
                      </div>
                      <div className="data-item-actions">
                        <IconButton
                          variant="primary"
                          label="Open rooms popup"
                          onClick={() => void openRoomsModal(building.id)}
                        >
                          <PlusIcon />
                        </IconButton>
                        {canMutate && (
                          <>
                            <IconButton
                              variant="ghost"
                              label="Rename building"
                              onClick={() => {
                                setEditingBuildingId(building.id);
                                setEditingBuildingName(building.name);
                              }}
                            >
                              <EditIcon />
                            </IconButton>
                            <IconButton
                              variant="danger"
                              label="Delete building"
                              disabled={isDeleting}
                              onClick={() => void handleDeleteBuilding(building.id)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {activeBuilding && (
        <div className="rooms-modal-overlay" onClick={closeRoomsModal}>
          <div
            className="card rooms-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="roomsModalTitle"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rooms-modal-header">
              <div>
                <h3 id="roomsModalTitle">Rooms - {activeBuilding.name}</h3>
                <p>All room CRUD for this building lives here.</p>
              </div>
              <IconButton variant="ghost" label="Close rooms popup" onClick={closeRoomsModal}>
                <CancelIcon />
              </IconButton>
            </div>

            <div className="rooms-modal-body">
              {loadingRooms && <p className="loading-text">Loading rooms...</p>}
              {!loadingRooms && rooms.length === 0 && <p className="empty-text">No rooms in this building.</p>}

              {rooms.length > 0 && (
                <div className="rooms-selection-list" role="listbox" aria-label="Rooms in this building">
                  {rooms.map((room) => {
                    const isSelected = selectedRoomId === room.id;

                    return (
                      <button
                        key={room.id}
                        type="button"
                        className={`room-select-item ${isSelected ? "is-selected" : ""}`}
                        onClick={() => setSelectedRoomId(room.id)}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <span className="room-select-title">{room.name}</span>
                        <span className="room-select-subtitle">ID: {room.id}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {canMutate && (
                <form onSubmit={handleCreateRoom}>
                  <div className="icon-input-row">
                    <div className="form-field">
                      <label htmlFor="newRoomName">Add room</label>
                      <input
                        id="newRoomName"
                        className="input"
                        type="text"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        placeholder="e.g. Lab 101"
                        disabled={isCreatingRoom || loadingRooms}
                      />
                    </div>
                    <IconButton
                      type="submit"
                      variant="primary"
                      label="Add room"
                      disabled={isCreatingRoom || loadingRooms}
                      className="icon-input-submit"
                    >
                      <PlusIcon />
                    </IconButton>
                  </div>
                </form>
              )}

              {canMutate && rooms.length > 0 && selectedRoomId === "" && (
                <p className="empty-text">Click a room from the list to edit or delete it.</p>
              )}

              {canMutate && rooms.length > 0 && (
                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="selectedRoomName">Selected room name</label>
                    <input
                      id="selectedRoomName"
                      className="input"
                      type="text"
                      value={editingRoomName}
                      onChange={(e) => setEditingRoomName(e.target.value)}
                      disabled={selectedRoomId === "" || isUpdatingRoom || isDeletingRoom}
                    />
                  </div>
                  <div className="form-field room-icon-actions">
                    <label>Room actions</label>
                    <div className="icon-action-row">
                      <IconButton
                        variant="primary"
                        label="Save room name"
                        disabled={selectedRoomId === "" || isUpdatingRoom || isDeletingRoom}
                        onClick={() => void handleUpdateRoom()}
                      >
                        <SaveIcon />
                      </IconButton>
                      <IconButton
                        variant="danger"
                        label="Delete room"
                        disabled={selectedRoomId === "" || isDeletingRoom || isUpdatingRoom}
                        onClick={() => void handleDeleteRoom()}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}