// UI labs (issues #116 and #118): touch and mouse on the lab's map.
//
// Drag pans, pinch (or the mouse wheel) zooms, and a still tap calls `onTap`
// with the square under the finger. If `onHold` is given, a press held still
// for `PREVIEW_MAP.holdMs` calls it instead of `onTap` (Lab 2 uses that to
// place a camp); without it, a long press is just a tap, as in Lab 1.
// If `grab` says yes to the square a press starts on, a drag moves that
// thing instead of panning: `onGrabMove` hears each square the finger
// crosses (Lab 2 drags a new camp's 3 x 3 with it: owner, UI rework). A
// grab that does not move is a tap.
//
// The same gestures as the game's map (map/mapView.ts).

import { cellAt } from '../map/camera';
import { PREVIEW_MAP } from '../map/palette';
import { clampLabCamera, pannedLab, zoomedLab } from './labCamera';
import type { GroundSize, LabCamera, ViewSize } from './labCamera';

export interface LabGestureHooks {
  /** The camera now. */
  camera: () => LabCamera;
  /** Move the camera (and redraw). */
  setCamera: (camera: LabCamera) => void;
  /** The map's size, in squares. */
  ground: () => GroundSize;
  /** A still tap on square (x, y) of the map. */
  onTap: (x: number, y: number) => void;
  /** A press held still on square (x, y). Optional. */
  onHold?: (x: number, y: number) => void;
  /** True if a press starting on square (x, y) grabs something to drag. Optional. */
  grab?: (x: number, y: number) => boolean;
  /** The finger, dragging what it grabbed, is over square (x, y) now. */
  onGrabMove?: (x: number, y: number) => void;
}

/** Listen for drags, pinches, the wheel and taps on `canvas`. */
export function attachLabGestures(canvas: HTMLCanvasElement, hooks: LabGestureHooks): void {
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: {
    kind: 'press' | 'drag' | 'pinch' | 'held' | 'grab';
    /** For 'grab': true once the finger has moved past the drag threshold. */
    moved: boolean;
    camera: LabCamera;
    startX: number;
    startY: number;
    pinchDistance: number;
    pinchMidX: number;
    pinchMidY: number;
  } | null = null;
  /** The timer that turns a still press into a hold; `null` when none is running. */
  let holdTimer: ReturnType<typeof setTimeout> | null = null;

  function view(): ViewSize {
    return { width: canvas.clientWidth, height: canvas.clientHeight };
  }

  function stopHoldTimer(): void {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  /** The square under the page point (clientX, clientY), or `null` if it is off the map. */
  function squareAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = canvas.getBoundingClientRect();
    const camera = hooks.camera();
    const cell = cellAt(
      camera,
      clientX - rect.left,
      clientY - rect.top,
      view().width / camera.cells,
    );
    const ground = hooks.ground();
    if (cell.x < 0 || cell.y < 0 || cell.x >= ground.x || cell.y >= ground.y) {
      return null;
    }
    return cell;
  }

  function twoFingers(): { midX: number; midY: number; distance: number } | null {
    const [a, b] = [...pointers.values()];
    if (a === undefined || b === undefined) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    return {
      midX: (a.x + b.x) / 2 - rect.left,
      midY: (a.y + b.y) / 2 - rect.top,
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    };
  }

  function startPinch(): void {
    const fingers = twoFingers();
    if (gesture !== null && fingers !== null) {
      stopHoldTimer();
      gesture.kind = 'pinch';
      gesture.camera = { ...hooks.camera() };
      gesture.pinchDistance = fingers.distance;
      gesture.pinchMidX = fingers.midX;
      gesture.pinchMidY = fingers.midY;
    }
  }

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      const start = squareAt(event.clientX, event.clientY);
      const grabbed = start !== null && hooks.grab !== undefined && hooks.grab(start.x, start.y);
      gesture = {
        kind: grabbed ? 'grab' : 'press',
        moved: false,
        camera: { ...hooks.camera() },
        startX: event.clientX,
        startY: event.clientY,
        pinchDistance: 0,
        pinchMidX: 0,
        pinchMidY: 0,
      };
      const onHold = hooks.onHold;
      if (onHold !== undefined && !grabbed) {
        const { clientX, clientY } = event;
        holdTimer = setTimeout(() => {
          holdTimer = null;
          if (gesture !== null && gesture.kind === 'press') {
            gesture.kind = 'held';
            const square = squareAt(clientX, clientY);
            if (square !== null) {
              onHold(square.x, square.y);
            }
          }
        }, PREVIEW_MAP.holdMs);
      }
    } else {
      startPinch();
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId) || gesture === null) {
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.kind === 'pinch') {
      const fingers = twoFingers();
      if (fingers === null) {
        return;
      }
      const cells = (gesture.camera.cells * gesture.pinchDistance) / fingers.distance;
      hooks.setCamera(
        zoomedLab(
          gesture.camera,
          cells,
          { x: gesture.pinchMidX, y: gesture.pinchMidY },
          { x: fingers.midX, y: fingers.midY },
          hooks.ground(),
          view(),
        ),
      );
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (gesture.kind === 'grab') {
      if (Math.hypot(dx, dy) > PREVIEW_MAP.dragThresholdPx) gesture.moved = true;
      const square = squareAt(event.clientX, event.clientY);
      if (gesture.moved && square !== null && hooks.onGrabMove !== undefined) {
        hooks.onGrabMove(square.x, square.y);
      }
      return;
    }
    if (gesture.kind === 'press' && Math.hypot(dx, dy) > PREVIEW_MAP.dragThresholdPx) {
      gesture.kind = 'drag';
      stopHoldTimer();
    }
    if (gesture.kind === 'drag') {
      hooks.setCamera(pannedLab(gesture.camera, dx, dy, hooks.ground(), view()));
    }
  });

  function lift(event: PointerEvent, cancelled: boolean): void {
    if (!pointers.has(event.pointerId)) {
      return;
    }
    pointers.delete(event.pointerId);
    if (gesture === null) {
      return;
    }
    if (pointers.size >= 2 && gesture.kind === 'pinch') {
      startPinch(); // a new pair of fingers: start afresh, or the map would jump
    }
    if (pointers.size > 0) {
      return;
    }
    stopHoldTimer();
    const ended = gesture;
    gesture = null;
    if ((ended.kind === 'press' || (ended.kind === 'grab' && !ended.moved)) && !cancelled) {
      const square = squareAt(event.clientX, event.clientY);
      if (square !== null) {
        hooks.onTap(square.x, square.y);
      }
    }
  }
  canvas.addEventListener('pointerup', (event) => lift(event, false));
  canvas.addEventListener('pointercancel', (event) => lift(event, true));

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const camera = hooks.camera();
      const cells = camera.cells * Math.exp(event.deltaY * PREVIEW_MAP.wheelZoomRate);
      hooks.setCamera(zoomedLab(camera, cells, point, point, hooks.ground(), view()));
    },
    { passive: false },
  );

  window.addEventListener('resize', () => {
    hooks.setCamera(clampLabCamera(hooks.camera(), hooks.ground(), view()));
  });
}
