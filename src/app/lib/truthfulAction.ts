interface TruthfulActionCallbacks {
  onSuccess: () => void;
  onError: (error: Error) => void;
}

export async function runTruthfulAction(
  operation: () => Promise<unknown>,
  callbacks: TruthfulActionCallbacks,
): Promise<boolean> {
  try {
    await operation();
    callbacks.onSuccess();
    return true;
  } catch (reason) {
    callbacks.onError(reason instanceof Error ? reason : new Error('Operation failed'));
    return false;
  }
}

export async function runBestEffortAfterCommit(
  operation: () => Promise<unknown>,
  onError: (error: Error) => void,
): Promise<void> {
  try {
    await operation();
  } catch (reason) {
    onError(reason instanceof Error ? reason : new Error('Ancillary operation failed'));
  }
}
