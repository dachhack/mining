import { ENGINE_VERSION } from '../engine';

// M0 placeholder. The real title screen arrives in M3.
const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  root.innerHTML = `
    <main>
      <h1>Mining Game</h1>
      <p data-testid="status">Scaffold build. Engine v${ENGINE_VERSION}.</p>
    </main>
  `;
}
