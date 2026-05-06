const queue = [];
let draining = false;

export function enqueue(task) {
  queue.push({ task, retries: 0 });
  void processQueue();
}

export async function processQueue() {
  if (draining) return;
  draining = true;

  while (queue.length > 0) {
    const item = queue[0];

    try {
      await item.task();
      queue.shift();
    } catch (err) {
      item.retries += 1;
      if (item.retries > 3) {
        console.error("Failed permanently:", err);
        queue.shift();
      }
    }
  }

  draining = false;
}
