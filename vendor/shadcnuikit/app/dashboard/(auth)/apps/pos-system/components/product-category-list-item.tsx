import { ProductCategory } from "@/app/dashboard/(auth)/apps/pos-system/store";
import { RadioGroupItem } from "@/components/ui/radio-group";

type ProductCategoryListItem = {
  category: ProductCategory;
};

export default function ProductCategoryListItem({ category }: ProductCategoryListItem) {
  return (
    <div
      key={category.id}
      className="has-data-[state=checked]:border-primary has-focus-visible:border-ring has-focus-visible:ring-ring/50 hover:bg-muted relative flex w-24 cursor-pointer flex-col items-center gap-4 rounded-md border px-2 py-2 text-center outline-none lg:w-32 lg:py-6">
      <RadioGroupItem id={`c-${category.id}`} value={category.id.toString()} className="sr-only" />
      <span className="text-3xl lg:text-4xl">{category.icon}</span>
      <label
        htmlFor={`c-${category.id}`}
        className="text-foreground cursor-pointer leading-none after:absolute after:inset-0">
        {category.name}
      </label>
    </div>
  );
}
