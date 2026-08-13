import { PageHeader } from "@/components/page-header";
import { ShoppingList } from "@/components/shopping-list";
import { getLowStock, getShoppingCatalog, getShoppingItems } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ShoppingPage() {
  const [items, low, catalog] = await Promise.all([getShoppingItems(), getLowStock(), getShoppingCatalog()]);
  const outstanding = items.filter((i) => !i.checked).length;

  return (
    <div className="pb-6">
      <PageHeader
        title="Shopping"
        subtitle={
          items.length === 0
            ? "Nothing on the list"
            : `${outstanding} still to get`
        }
      />
      <ShoppingList items={items} lowStock={low} catalog={catalog} />
    </div>
  );
}
