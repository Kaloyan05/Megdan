// Малки помощници за DOM без framework.

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k.startsWith('--')) el.style.setProperty(k, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function mount(parent, ...kids) {
  parent.replaceChildren();
  append(parent, kids);
  return parent;
}

let toastWrap = null;
export function toast(message, ms = 2600) {
  if (!toastWrap) {
    toastWrap = h('div', { class: 'toast-wrap', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastWrap);
  }
  const t = h('div', { class: 'toast', text: message });
  toastWrap.append(t);
  setTimeout(() => t.remove(), ms);
}

export function avatarEl(person, size = '') {
  return h('span', {
    class: `avatar ${size}`.trim(),
    '--av': `var(--seat-${person?.color ?? 2})`,
    'aria-hidden': 'true',
    text: person?.avatar ?? '🙂',
  });
}

export function storageGet(key, fallback = null) {
  try { const v = localStorage.getItem(`megdan:ui:${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function storageSet(key, value) {
  try { localStorage.setItem(`megdan:ui:${key}`, JSON.stringify(value)); } catch { /* няма достъп */ }
}
