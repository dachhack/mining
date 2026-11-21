import './preview.css';
import './lab/lab.css';
import { mountLauncher } from './launcher';

// The start screen (issue #116) leads to the early phone preview (issue
// #64), the game, and to the UI labs beside it.
const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  mountLauncher(root);
}
