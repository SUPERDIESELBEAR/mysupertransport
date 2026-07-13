/**
 * Wrap a promise so it rejects with a friendly error after `ms` milliseconds.
 * Keeps document / storage requests from hanging forever on flaky mobile
 * networks — the caller gets a real rejection to handle + toast.
 */
export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label = 'Request',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out. Please check your connection and try again.`));
    }, ms);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err)   => { clearTimeout(timer); reject(err); },
    );
  });
}