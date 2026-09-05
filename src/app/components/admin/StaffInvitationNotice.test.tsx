import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StaffInvitationNotice from './StaffInvitationNotice';

test('staff access guidance routes administrators to worker-owned invitations', () => {
  const markup = renderToStaticMarkup(React.createElement(StaffInvitationNotice, {
    onInvite: () => undefined,
  }));

  assert.match(markup, /propre compte/i);
  assert.match(markup, /invitation/i);
  assert.doesNotMatch(markup, /type="password"/);
  assert.doesNotMatch(markup, /mot de passe temporaire/i);
});
