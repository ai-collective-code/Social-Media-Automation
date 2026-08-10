import TopBar from "@/components/TopBar";
import BrandForm from "../BrandForm";

export default function NewBrandPage() {
  return (
    <>
      <TopBar title="New brand" subtitle="The profile every run for this brand will use" />
      <div className="max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <BrandForm />
      </div>
    </>
  );
}
