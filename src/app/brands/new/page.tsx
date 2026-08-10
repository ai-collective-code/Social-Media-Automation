import Link from "next/link";
import TopBar from "@/components/TopBar";
import BrandForm from "../BrandForm";

export default function NewBrandPage() {
  return (
    <>
      <TopBar
        title="New brand"
        subtitle="The profile every run for this brand will use"
        actions={
          <Link
            href="/brands/generate"
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:border-accent hover:text-fg"
          >
            ✨ Draft this from a company name
          </Link>
        }
      />
      <div className="max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <BrandForm />
      </div>
    </>
  );
}
