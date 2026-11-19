import './preview.css';
import { mountPreview } from './preview';

// Until M3's real screens arrive, the page is the early phone preview
// (issue #64): a tap version of `npm run play`.
const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  mountPreview(root);
}
