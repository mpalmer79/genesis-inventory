import InventoryExplorer from '../components/InventoryExplorer.js';
import SiteFooter from '../components/SiteFooter.js';
import { loadInventory } from '../lib/inventorySource.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  const { inventory } = await loadInventory();

  return (
    <>
      <InventoryExplorer inventory={inventory} />
      <SiteFooter />
    </>
  );
}
