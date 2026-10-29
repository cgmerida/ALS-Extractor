// The UI scripts can't run under Node; at least make sure they parse.
const test = require('node:test');
const { html } = require('./helpers');

test('inline UI scripts are syntactically valid', () => {
  for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(code);
});
