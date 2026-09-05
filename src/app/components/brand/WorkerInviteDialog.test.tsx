import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WorkerInviteDialogView from './WorkerInviteDialogView';
import InvitationDecisionView from '../pages/InvitationDecisionView';

test('renders only server-assignable worker invitation roles', () => {
  const markup = renderToStaticMarkup(React.createElement(WorkerInviteDialogView, {
    locationId: 'paris',
    open: true,
    onOpenChange: () => undefined,
    createInvitation: async () => ({ invitationId: 'invite-worker' }),
  }));

  assert.match(markup, /Inviter un collaborateur/);
  assert.match(markup, /value="worker"/);
  assert.match(markup, /value="salon_admin"/);
  assert.doesNotMatch(markup, /value="principal_admin"/);
  assert.doesNotMatch(markup, /type="password"/);
});

test('renders acceptance controls for the matching signed-in account', () => {
  const markup = renderToStaticMarkup(React.createElement(InvitationDecisionView, {
    invitation: {
      displayName: 'Invited Worker',
      email: 'worker@example.com',
      role: 'worker',
      status: 'pending',
    },
    submitting: false,
    onRespond: () => undefined,
  }));

  assert.match(markup, /worker@example.com/);
  assert.match(markup, /Accepter/);
  assert.match(markup, /Refuser/);
  assert.doesNotMatch(markup, /type="password"/);
});
