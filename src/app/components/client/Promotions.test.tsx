import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Promotions } from './Promotions';

test('renders scoped offers and keeps a truthful load warning visible', () => {
  const html = renderToStaticMarkup(<Promotions
    loading={false}
    error="Les offres n’ont pas pu être actualisées."
    onCopy={() => undefined}
    campaigns={[{
      id: 'campaign-a', tenantId: 'location-a', title: 'Offre VIP',
      description: 'Merci pour votre fidélité.', segment: 'vip',
      couponCode: 'VIP20', discountAmount: 20,
    }]}
  />);

  assert.match(html, /Offre VIP/);
  assert.match(html, /VIP20/);
  assert.match(html, /20%/);
  assert.match(html, /Les offres n’ont pas pu être actualisées/);
  assert.match(html, /Copier/);
});

test('distinguishes loading from a successfully loaded empty campaign list', () => {
  assert.match(renderToStaticMarkup(<Promotions
    loading
    error={null}
    campaigns={[]}
    onCopy={() => undefined}
  />), /Chargement des offres/);
  assert.match(renderToStaticMarkup(<Promotions
    loading={false}
    error={null}
    campaigns={[]}
    onCopy={() => undefined}
  />), /Aucune offre promotionnelle/);
});
