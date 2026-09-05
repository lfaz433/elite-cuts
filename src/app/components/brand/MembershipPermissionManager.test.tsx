import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ReactElement, ReactNode } from 'react';
import { DEFAULT_SALON_ADMIN_PERMISSIONS } from '../../lib/marketplace/permissions';
import MembershipPermissionManager from './MembershipPermissionManager';

function elements(node: ReactNode): ReactElement[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node === 'object' && 'props' in node) {
    const element = node as ReactElement<{ children?: ReactNode }>;
    const renderedChildren = typeof element.type === 'function'
      ? elements(element.type(element.props))
      : elements(element.props.children);
    return [element, ...renderedChildren];
  }
  return [];
}

test('a Principal Admin selects a Salon Admin and persists inviteWorkers', async () => {
  const selected: string[] = [];
  const changed: boolean[] = [];
  const saved: string[] = [];
  const tree = MembershipPermissionManager({
    members: [
      {
        id: 'brand__paris__admin-a',
        displayName: 'Admin A',
        email: 'a@example.com',
        permissions: { ...DEFAULT_SALON_ADMIN_PERMISSIONS },
      },
      {
        id: 'brand__paris__admin-b',
        displayName: 'Admin B',
        email: 'b@example.com',
        permissions: { ...DEFAULT_SALON_ADMIN_PERMISSIONS, inviteWorkers: true },
      },
    ],
    selectedId: 'brand__paris__admin-a',
    value: { ...DEFAULT_SALON_ADMIN_PERMISSIONS },
    onSelect: membershipId => selected.push(membershipId),
    onChange: permissions => changed.push(permissions.inviteWorkers),
    onSave: async membershipId => { saved.push(membershipId); },
  });
  const rendered = elements(tree);
  const memberSelect = rendered.find(element => (
    element.type === 'select' && element.props['aria-label'] === 'Salon Admin'
  ));
  const inviteWorkers = rendered.find(element => (
    element.type === 'input' && element.props.name === 'inviteWorkers'
  ));
  const save = rendered.find(element => (
    element.type === 'button' && element.props.type === 'button'
  ));

  assert.ok(memberSelect);
  assert.ok(inviteWorkers);
  assert.ok(save);
  assert.equal(memberSelect.props.value, 'brand__paris__admin-a');
  memberSelect.props.onChange({ currentTarget: { value: 'brand__paris__admin-b' } });
  inviteWorkers.props.onChange({ currentTarget: { checked: true } });
  await save.props.onClick();
  assert.deepEqual(selected, ['brand__paris__admin-b']);
  assert.deepEqual(changed, [true]);
  assert.deepEqual(saved, ['brand__paris__admin-a']);
});
