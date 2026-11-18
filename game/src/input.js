// Solmar Heat — keyboard (and mouse) input.
// Keys are tracked as a live set. A tap is an edge: the keydown lands in a
// pending set, beginFrame() moves it into the frame's set (so a press that
// arrives while the frame is rendering is never lost), and pressed() consumes
// it, so one tap fires exactly once even when the frame runs several fixed
// simulation steps.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressedSet = new Set();
    this.framePressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.clicked = false;
  }

  attach(el) {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (!e.repeat) this.pressedSet.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    if (el) {
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        this.mouseX = e.clientX - r.left;
        this.mouseY = e.clientY - r.top;
      });
      el.addEventListener('mousedown', () => {
        this.clicked = true;
      });
    }
  }

  get up() { return this.keys.has('KeyW') || this.keys.has('ArrowUp'); }
  get down() { return this.keys.has('KeyS') || this.keys.has('ArrowDown'); }
  get left() { return this.keys.has('KeyA') || this.keys.has('ArrowLeft'); }
  get right() { return this.keys.has('KeyD') || this.keys.has('ArrowRight'); }
  get run() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }

  pressed(code) {
    if (this.framePressed.has(code)) {
      this.framePressed.delete(code);
      return true;
    }
    return false;
  }

  // Call at the start of each animation frame: presses that arrived since
  // the last frame become this frame's presses.
  beginFrame() {
    this.framePressed = this.pressedSet;
    this.pressedSet = new Set();
  }

  endFrame() {
    this.clicked = false;
  }
}
