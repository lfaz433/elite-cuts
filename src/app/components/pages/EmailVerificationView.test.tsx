import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import EmailVerificationView from './EmailVerificationView';

test('an unverified invitee can resend and refresh email verification', () => {
  const markup = renderToStaticMarkup(React.createElement(EmailVerificationView, {
    email: 'worker@example.com',
    busy: false,
    onResend: () => undefined,
    onRefresh: () => undefined,
  }));

  assert.match(markup, /worker@example.com/);
  assert.match(markup, /Renvoyer/i);
  assert.match(markup, /vérifié/i);
});
