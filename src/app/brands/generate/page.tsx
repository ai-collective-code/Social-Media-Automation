import TopBar from "@/components/TopBar";
import BrandGeneratorClient from "./BrandGeneratorClient";

export const dynamic = "force-dynamic";

export default function GenerateBrandPage() {
  return (
    <>
      <TopBar
        title="Draft a brand profile"
        subtitle="Type a company name — copy what's useful into the real form"
      />
      <div className="max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <BrandGeneratorClient />
      </div>
    </>
  );
}
