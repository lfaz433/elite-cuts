import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { runBestEffortAfterCommit, runTruthfulAction } from './truthfulAction';

test('success is reported only after the booking operation resolves', async () => {
  const events: string[] = [];
  let finish!: () => void;
  const operation = new Promise<void>(resolve => { finish = resolve; });
  const pending = runTruthfulAction(() => operation, {
    onSuccess: () => events.push('success'),
    onError: () => events.push('error'),
  });

  assert.deepEqual(events, []);
  finish();
  assert.equal(await pending, true);
  assert.deepEqual(events, ['success']);
});

test('rejected booking operation reports an error and never success', async () => {
  const events: string[] = [];
  assert.equal(await runTruthfulAction(async () => {
    throw new Error('write failed');
  }, {
    onSuccess: () => events.push('success'),
    onError: error => events.push(error.message),
  }), false);
  assert.deepEqual(events, ['write failed']);
});

test('a failed ancillary update cannot turn an already committed mutation into an error', async () => {
  const errors: string[] = [];
  await runBestEffortAfterCommit(async () => {
    throw new Error('unread marker denied');
  }, error => errors.push(error.message));
  assert.deepEqual(errors, ['unread marker denied']);
});
