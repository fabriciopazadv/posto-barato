import { z } from 'zod';
import { STATION_SORTS } from '@posto-barato/shared-types';

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

export function stationsQuerySchema(maxLimit: number, maxRadiusKm: number) {
  return z
    .object({
      latitude: lat.optional(),
      longitude: lng.optional(),
      radiusKm: z.coerce.number().positive().max(maxRadiusKm).optional(),
      municipality: z.string().min(1).max(120).optional(),
      state: z.string().length(2).optional(),
      product: z.string().min(1).max(40).optional(),
      minPrice: z.coerce.number().nonnegative().optional(),
      maxPrice: z.coerce.number().nonnegative().optional(),
      updatedWithinHours: z.coerce.number().positive().max(24 * 30).optional(),
      sort: z.enum(STATION_SORTS).default('lowest_price'),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(maxLimit).default(20),
    })
    .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
      message: 'latitude e longitude devem ser informadas juntas',
    })
    .refine((v) => !(v.radiusKm !== undefined && v.latitude === undefined), {
      message: 'radiusKm exige latitude e longitude',
    })
    .refine((v) => v.sort !== 'nearest' || v.latitude !== undefined, {
      message: 'sort=nearest exige latitude e longitude',
    });
}

export const stationIdParams = z.object({
  id: z.string().uuid('id de posto inválido'),
});

export const originQuery = z.object({
  latitude: lat.optional(),
  longitude: lng.optional(),
});

export const historyQuery = z.object({
  product: z.string().min(1).max(40),
  windowDays: z.coerce.number().int().refine((v) => [7, 30, 90].includes(v), {
    message: 'windowDays deve ser 7, 30 ou 90',
  }).default(30),
});

export const summaryQuery = z.object({
  municipality: z.string().min(1).max(120),
  state: z.string().length(2),
  product: z.string().min(1).max(40).optional(),
});

export const latestQuery = z.object({
  municipality: z.string().min(1).max(120),
  state: z.string().length(2),
  product: z.string().min(1).max(40).optional(),
});

export const compareBody = z.object({
  stationIds: z.array(z.string().uuid()).min(2).max(3),
  productCode: z.string().min(1).max(40),
  originLatitude: lat.optional(),
  originLongitude: lng.optional(),
  desiredLiters: z.number().positive().max(1000).optional(),
  amountToSpend: z.number().positive().max(100000).optional(),
  vehicleConsumptionKmPerLiter: z.number().positive().max(100).optional(),
});
