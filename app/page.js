import inventory from '../data/inventory.json';
import InventoryExplorer from '../components/InventoryExplorer.js';

export default function HomePage() {
  return <InventoryExplorer inventory={inventory} />;
}
