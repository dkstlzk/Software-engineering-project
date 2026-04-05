import type { Router } from "express";

/**
 * Feature module contract used by the server bootstrap.
 *
 * `basePath` is mounted under `/api`.
 * Example: basePath `/bookings` => `/api/bookings`
 */
export interface ApiModule {
  key: string;
  basePath: `/${string}`;
  router: Router;
}
