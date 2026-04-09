import { request } from "./client";
import type { Building } from "./types";

export async function getBuildings(): Promise<Building[]> {
  return request<Building[]>("/buildings");
}

export type CreateBuildingInput = {
  name: string;
  location?: string | null;
  managedByStaffId?: number | null;
};

export async function createBuilding(input: CreateBuildingInput): Promise<Building> {
  return request<Building>("/buildings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type UpdateBuildingInput = {
  name?: string;
  location?: string | null;
  managedByStaffId?: number | null;
};

export async function updateBuilding(id: number, input: UpdateBuildingInput): Promise<Building> {
  return request<Building>(`/buildings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteBuilding(id: number): Promise<void> {
  await request<{ message: string }>(`/buildings/${id}`, {
    method: "DELETE",
  });
}
