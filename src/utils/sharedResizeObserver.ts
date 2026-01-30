type ResizeCallback = (entry: ResizeObserverEntry) => void;

const callbacks = new Map<Element, ResizeCallback>();
let sharedObserver: ResizeObserver | null = null;

function getObserver(): ResizeObserver {
  if (!sharedObserver) {
    sharedObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const callback = callbacks.get(entry.target);
        if (callback) {
          callback(entry);
        }
      }
    });
  }
  return sharedObserver;
}

export function observeResize(
  element: Element,
  callback: ResizeCallback
): () => void {
  const observer = getObserver();
  callbacks.set(element, callback);
  observer.observe(element);

  return () => {
    callbacks.delete(element);
    observer.unobserve(element);

    if (callbacks.size === 0 && sharedObserver) {
      sharedObserver.disconnect();
      sharedObserver = null;
    }
  };
}
