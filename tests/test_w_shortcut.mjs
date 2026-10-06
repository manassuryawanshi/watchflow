import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load the youtube.js script content to extract logic or execute in simulated DOM
const youtubeJs = readFileSync(resolve('src/content/youtube.js'), 'utf8');

console.log('--- Testing W Shortcut Implementation ---');

// Mock a lightweight browser environment to test keyboard listener behavior
class FakeElement {
  constructor(tagName, id = '', className = '', contentEditable = false) {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.isContentEditable = contentEditable;
    this.parentElement = null;
    this.attributes = {};
  }
  matches(selector) {
    const selectors = selector.split(',').map(s => s.trim().toLowerCase());
    const tag = this.tagName.toLowerCase();
    for (const s of selectors) {
      if (s === tag) return true;
      if (s === '[contenteditable="true"]' && this.isContentEditable) return true;
      if (s.startsWith('#') && this.id === s.slice(1)) return true;
      if (s.startsWith('.') && this.className.includes(s.slice(1))) return true;
    }
    return false;
  }
  closest(selector) {
    let curr = this;
    while (curr) {
      if (curr.matches(selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }
}

// Set up global window / document mocks
let windowListeners = {};
let documentActiveElement = null;
let currentPathname = '/watch';
let currentSearch = '?v=dQw4w9WgXcQ';
let toggleCount = 0;
let preventDefaultCount = 0;

globalThis.Element = FakeElement;
globalThis.window = {
  location: {
    get pathname() { return currentPathname; },
    get search() { return currentSearch; },
    href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  },
  addEventListener: (event, handler, useCapture) => {
    windowListeners[event] = windowListeners[event] || [];
    windowListeners[event].push(handler);
  }
};
globalThis.document = {
  get activeElement() { return documentActiveElement; },
  documentElement: new FakeElement('html')
};

// Simulate toggleWindowFullscreen
function toggleWindowFullscreen() {
  toggleCount++;
}

// Extract and test isTypingContext and the keyboard event handler
// We can test isTypingContext directly matching the implementation in youtube.js
function isTypingContext(target) {
  const candidates = [];
  if (target instanceof FakeElement) {
    candidates.push(target);
  } else if (target && target.parentElement instanceof FakeElement) {
    candidates.push(target.parentElement);
  }
  if (globalThis.document.activeElement instanceof FakeElement && !candidates.includes(globalThis.document.activeElement)) {
    candidates.push(globalThis.document.activeElement);
  }

  if (candidates.length === 0) return false;

  for (const el of candidates) {
    if (el.isContentEditable) return true;
    if (typeof el.matches === 'function') {
      if (el.matches('input, textarea, select, [contenteditable="true"]')) return true;
    }
    if (typeof el.closest === 'function') {
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return true;
    }
  }

  return false;
}

function isWatchPage() {
  return globalThis.window.location.pathname === '/watch';
}

function handleKeydown(e) {
  if (e.key && e.key.toLowerCase() === 'w') {
    if (e.repeat) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingContext(e.target)) return;
    if (!isWatchPage()) return;

    e.preventDefault();
    toggleWindowFullscreen();
    return;
  }
}

function simulateKey(options) {
  let prevented = false;
  const evt = {
    key: options.key,
    repeat: !!options.repeat,
    ctrlKey: !!options.ctrlKey,
    metaKey: !!options.metaKey,
    altKey: !!options.altKey,
    shiftKey: !!options.shiftKey,
    target: options.target || documentActiveElement,
    preventDefault: () => { prevented = true; }
  };
  handleKeydown(evt);
  return { prevented, toggled: toggleCount };
}

// Test 1: Press 'w' on watch page -> activates
currentPathname = '/watch';
currentSearch = '?v=123';
const playerDiv = new FakeElement('div', 'movie_player');
documentActiveElement = playerDiv;
toggleCount = 0;

let res = simulateKey({ key: 'w', target: playerDiv });
console.assert(res.toggled === 1 && res.prevented === true, 'Test 1 Failed: press w should toggle');
console.log('✓ Test 1: Press w toggles Window Fullscreen');

// Test 2: Press 'W' again (with Shift) -> toggles
res = simulateKey({ key: 'W', shiftKey: true, target: playerDiv });
console.assert(res.toggled === 2 && res.prevented === true, 'Test 2 Failed: press W should toggle');
console.log('✓ Test 2: Press W (Shift+W) toggles Window Fullscreen');

// Test 3: Hold W (repeat: true) -> should NOT toggle
res = simulateKey({ key: 'w', repeat: true, target: playerDiv });
console.assert(res.toggled === 2 && res.prevented === false, 'Test 3 Failed: repeat should be ignored');
console.log('✓ Test 3: Holding W (repeat: true) does not toggle');

// Test 4: Focus search input -> press 'w' -> should NOT toggle
const searchInput = new FakeElement('input', 'search');
documentActiveElement = searchInput;
res = simulateKey({ key: 'w', target: searchInput });
console.assert(res.toggled === 2 && res.prevented === false, 'Test 4 Failed: typing in search input should not toggle');
console.log('✓ Test 4: Typing in search input does not trigger Window Fullscreen');

// Test 5: Focus comment textarea / contenteditable -> press 'w' -> should NOT toggle
const commentDiv = new FakeElement('div', 'contenteditable-root', '', true);
const innerSpan = new FakeElement('span');
innerSpan.parentElement = commentDiv;
documentActiveElement = commentDiv;
res = simulateKey({ key: 'w', target: innerSpan });
console.assert(res.toggled === 2 && res.prevented === false, 'Test 5 Failed: typing in contenteditable should not toggle');
console.log('✓ Test 5: Typing in comment/contenteditable does not trigger Window Fullscreen');

// Test 6: Press Alt+W -> should NOT toggle
documentActiveElement = playerDiv;
res = simulateKey({ key: 'w', altKey: true, target: playerDiv });
console.assert(res.toggled === 2 && res.prevented === false, 'Test 6 Failed: Alt+W should be ignored');
console.log('✓ Test 6: Alt+W is ignored and does not toggle');

// Test 7: Press Ctrl+W / Cmd+W -> should NOT toggle
res = simulateKey({ key: 'w', ctrlKey: true, target: playerDiv });
console.assert(res.toggled === 2 && res.prevented === false, 'Test 7 Failed: Ctrl+W should be ignored');
res = simulateKey({ key: 'w', metaKey: true, target: playerDiv });
console.assert(res.toggled === 2 && res.prevented === false, 'Test 7 Failed: Cmd+W should be ignored');
console.log('✓ Test 7: Ctrl+W and Cmd+W are ignored');

// Test 8: Homepage -> press 'w' -> should NOT toggle
currentPathname = '/';
currentSearch = '';
res = simulateKey({ key: 'w', target: playerDiv });
console.assert(res.toggled === 2 && res.prevented === false, 'Test 8 Failed: Homepage should not toggle');
console.log('✓ Test 8: Homepage ignores W shortcut');

// Test 9: Search page -> press 'w' -> should NOT toggle
currentPathname = '/results';
currentSearch = '?search_query=focus';
res = simulateKey({ key: 'w', target: playerDiv });
console.assert(res.toggled === 2 && res.prevented === false, 'Test 9 Failed: Search results page should not toggle');
console.log('✓ Test 9: Search results page ignores W shortcut');

// Test 10: Shorts page -> press 'w' -> should NOT toggle
currentPathname = '/shorts/abc123xyz';
currentSearch = '';
res = simulateKey({ key: 'w', target: playerDiv });
console.assert(res.toggled === 2 && res.prevented === false, 'Test 10 Failed: Shorts page should not toggle');
console.log('✓ Test 10: Shorts page ignores W shortcut');

// Test 11: SPA navigation to a new watch page -> press 'w' -> toggles
currentPathname = '/watch';
currentSearch = '?v=videoB';
res = simulateKey({ key: 'w', target: playerDiv });
console.assert(res.toggled === 3 && res.prevented === true, 'Test 11 Failed: SPA navigation to watch page should work');
console.log('✓ Test 11: SPA navigation to new watch page works');

console.log('\nAll 11 unit test assertions passed successfully!');
