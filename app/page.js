import inventory from '../data/inventory.json';
import InventoryExplorer from '../components/InventoryExplorer.js';
import SiteFooter from '../components/SiteFooter.js';

export default function HomePage() {
  return (
    <>
      <InventoryExplorer inventory={inventory} />
      <SiteFooter />
    </>
  );
}
