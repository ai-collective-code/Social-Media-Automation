import { readJson, writeJson, newId } from "@/lib/json-store";
import type { Brand, BrandInput } from "@/lib/brand-types";

/**
 * A brand whose social presence we manage.
 *
 * This is the profile — set up once and reused by every run — as distinct from
 * a `Run`, which is one execution of the pipeline for this brand. Everything
 * here feeds downstream generation prompts, which is why the guardrail fields
 * exist: they are the difference between on-brand output and generic output.
 *
 * This module touches the filesystem, so Client Components must import types
 * and constants from `@/lib/brand-types` instead — see the note there.
 */

const FILE = "brands.json";

export type { Brand, BrandInput } from "@/lib/brand-types";
export { PLATFORM_OPTIONS } from "@/lib/brand-types";

export async function listBrands(): Promise<Brand[]> {
  const brands = await readJson<Brand[]>(FILE, []);
  return [...brands].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getBrand(id: string): Promise<Brand | undefined> {
  const brands = await readJson<Brand[]>(FILE, []);
  return brands.find((b) => b.id === id);
}

export async function createBrand(input: BrandInput): Promise<Brand> {
  const brands = await readJson<Brand[]>(FILE, []);
  const now = new Date().toISOString();
  const brand: Brand = { ...input, id: newId("brand"), createdAt: now, updatedAt: now };
  brands.push(brand);
  await writeJson(FILE, brands);
  return brand;
}

export async function updateBrand(
  id: string,
  patch: Partial<BrandInput>,
): Promise<Brand | undefined> {
  const brands = await readJson<Brand[]>(FILE, []);
  const brand = brands.find((b) => b.id === id);
  if (!brand) return undefined;
  Object.assign(brand, patch, { updatedAt: new Date().toISOString() });
  await writeJson(FILE, brands);
  return brand;
}

export async function deleteBrand(id: string): Promise<void> {
  const brands = await readJson<Brand[]>(FILE, []);
  await writeJson(
    FILE,
    brands.filter((b) => b.id !== id),
  );
}
