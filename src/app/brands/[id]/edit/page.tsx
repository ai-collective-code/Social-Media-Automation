import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import { getBrand } from "@/lib/brand-store";
import { removeBrand } from "../../actions";
import { Button, Card, Label } from "@/components/ui";
import BrandForm from "../../BrandForm";

export const dynamic = "force-dynamic";

export default async function EditBrandPage(props: PageProps<"/brands/[id]/edit">) {
  const { id } = await props.params;
  const brand = await getBrand(id);
  if (!brand) notFound();

  return (
    <>
      <TopBar title={`Edit ${brand.name}`} subtitle="Changes apply to the next run" />
      <div className="max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <BrandForm brand={brand} />

        <Card className="mt-8 border-bad-border">
          <Label>Delete brand</Label>
          {/* A disclosure rather than a bare button, so deletion always takes a
              deliberate second action even with JavaScript unavailable. */}
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-fg-2 hover:text-fg">
              Remove {brand.name} permanently
            </summary>
            <p className="mt-3 text-sm text-fg-3">
              The brand profile is deleted. Completed research and results stay on disk under their
              own run records, so past output is not lost.
            </p>
            <form action={removeBrand.bind(null, brand.id)} className="mt-3">
              <Button type="submit" variant="danger" size="sm">
                Delete this brand
              </Button>
            </form>
          </details>
        </Card>
      </div>
    </>
  );
}
