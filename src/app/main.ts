import './preview.css';
import './lab/lab.css';
import { mountLauncher } from './launcher';

// The game opens straight away (Lab 2 becomes the game, plan B1); the old
// game and the UI labs are a tap away, under Other versions, until removed.
const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  mountLauncher(root);
}
