import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReactElement, ReactNode } from 'react';
import { DEFAULT_SALON_ADMIN_PERMISSIONS } from '../../lib/marketplace/permissions';
import PermissionEditor from './PermissionEditor';

function elements(node: ReactNode): ReactElement[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node === 'object' && 'props' in node) {
    const element = node as ReactElement<{ children?: ReactNode }>;
    return [element, ...elements(element.props.children)];
  }
  return [];
}

test('toggles inviteWorkers without exposing Principal Admin as an assignable role', () => {
  let nextValue = { ...DEFAULT_SALON_ADMIN_PERMISSIONS };
  const tree = PermissionEditor({
    value: nextValue,
    onChange: value => {
      nextValue = value;
    },
    disabledKeys: [],
  });
  const rendered = elements(tree);
  const inviteWorkers = rendered.find(element => (
    element.type === 'input'
    && element.props.name === 'inviteWorkers'
  ));

  assert.ok(inviteWorkers, 'inviteWorkers permission control must be rendered');
  assert.equal(inviteWorkers.props.checked, false);
  inviteWorkers.props.onChange({ currentTarget: { checked: true } });
  assert.equal(nextValue.inviteWorkers, true);

  const roleValues = rendered
    .filter(element => element.type === 'option')
    .map(element => element.props.value);
  assert.deepEqual(roleValues, ['salon_admin', 'worker']);
  assert.equal(roleValues.includes('principal_admin'), false);
});
