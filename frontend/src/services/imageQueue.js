// Tiny concurrency limiter for image fetches so we never run more than CONCURRENCY at once.
const queue = [];
let running = 0;
const CONCURRENCY = 10;

// priority tasks (the visible card) jump to the front of the queue
export function enqueueImageTask(fn, priority = false) {
  return new Promise((resolve, reject) => {
    if (priority) queue.unshift({ fn, resolve, reject });
    else queue.push({ fn, resolve, reject });
    drain();
  });
}

function drain() {
  while (running < CONCURRENCY && queue.length > 0) {
    const { fn, resolve, reject } = queue.shift();
    running++;
    fn()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        running--;
        drain();
      });
  }
}
