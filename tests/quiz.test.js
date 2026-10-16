import { test } from 'node:test';
import assert from 'node:assert/strict';
import qz, { bankQuestions, cleanQuestions, QUESTION_MS } from '../src/games/quiz.js';
import { BANK, TOPICS } from '../src/games/quiz-bank.js';
import { replay } from '../src/core/engine.js';
import { createRng } from '../src/core/rng.js';

const P = ['a', 'b', 'c'];

test('банката: всяка тема има поне 10 въпроса с 4 различни отговора', () => {
  for (const t of TOPICS) {
    assert.ok(BANK[t.value].length >= 10, t.value);
    for (const [q, a, c] of BANK[t.value]) {
      assert.ok(q.length > 5);
      assert.equal(new Set(a).size, 4, q);
      assert.ok(c >= 0 && c < 4);
    }
  }
  const qs = bankQuestions('geo', 5, 's');
  assert.equal(qs.length, 5);
  assert.deepEqual(qs, bankQuestions('geo', 5, 's'), 'детерминистично');
});

test('проверка на въпросите от Claude: махат се лошите', () => {
  const ok = { q: 'Въпрос?', a: ['1', '2', '3', '4'], c: 2 };
  assert.equal(cleanQuestions([ok, { q: '', a: [] }, { ...ok, c: 7 }, { ...ok, a: ['1', '1', '2', '3'] }, ok, ok], 10).length, 3);
  assert.equal(cleanQuestions('не е масив', 5), null);
  assert.equal(cleanQuestions([ok], 5), null, 'твърде малко');
});

test('въпроси, отговори едновременно, точки за верен и бърз', () => {
  let s = qz.init('s', P, { topic: 'science', count: 5 });
  assert.equal(qz.validateMove(s, { type: 'answer', q: 0, choice: 0, ms: 1 }, 'b').reason, 'wait-questions');
  const items = bankQuestions('science', 5, 's');
  s = qz.applyMove(s, { type: 'questions', items }, 'a');
  assert.equal(s.phase, 'play');
  assert.equal(qz.validateMove(s, { type: 'questions', items }, 'b').reason, 'already-set');
  const c = items[0].c;
  s = qz.applyMove(s, { type: 'answer', q: 0, choice: c, ms: 0 }, 'b');
  assert.equal(qz.validateMove(s, { type: 'answer', q: 0, choice: c, ms: 0 }, 'b').reason, 'answered');
  assert.deepEqual(qz.waitingFor(s), ['a', 'c']);
  s = qz.applyMove(s, { type: 'answer', q: 0, choice: c, ms: QUESTION_MS }, 'a');
  s = qz.applyMove(s, { type: 'answer', q: 0, choice: (c + 1) % 4, ms: 100 }, 'c');
  assert.equal(s.q, 1);
  assert.deepEqual(s.scores, [100, 150, 0]);
  assert.deepEqual(s.reveal.right, ['a', 'b']);
  assert.equal(qz.validateMove(s, { type: 'answer', q: 0, choice: 1, ms: 1 }, 'a').reason, 'old-question');
});

test('пропускане на закъснелите само от отговорил играч', () => {
  let s = qz.applyMove(qz.init('s', P, { count: 5 }), { type: 'questions', items: bankQuestions('general', 5, 's') }, 'a');
  assert.equal(qz.validateMove(s, { type: 'skip', q: 0 }, 'a').reason, 'answer-first');
  s = qz.applyMove(s, { type: 'answer', q: 0, choice: 1, ms: 500 }, 'a');
  s = qz.applyMove(s, { type: 'skip', q: 0 }, 'a');
  assert.equal(s.q, 1);
});

test('цяла игра с ботове през replay', async () => {
  const { botMove } = await import('../src/core/bots.js');
  const players = ['u1', 'bot-1', 'bot-2'];
  let s = qz.init('full', players, { count: 10, topic: 'sport', source: 'bank' });
  const log = [];
  const push = (p, m) => { assert.ok(qz.validateMove(s, m, p).ok, JSON.stringify(m)); s = qz.applyMove(s, m, p); log.push({ i: log.length, p, t: log.length, m }); };
  push('u1', qz.autoMove(s));
  while (!qz.isOver(s)) {
    for (const b of ['bot-1', 'bot-2']) {
      const m = await botMove(qz, s, b, { seed: 'full', index: log.length, level: 'hard' });
      if (m) push(b, m);
    }
    if (!qz.isOver(s)) push('u1', { type: 'answer', q: s.q, choice: createRng(log.length).int(4), ms: 4000 });
  }
  const r = replay(qz, { seed: 'full', players, log, options: { count: 10, topic: 'sport', source: 'bank' } });
  assert.deepEqual(r.state, s);
  assert.equal(s.answers.length, 10);
});

test('Claude: подготовката ползва sample.json; при грешка — вградените', async () => {
  const s = qz.init('c', P, { topic: 'geo', count: 5, source: 'claude' });
  const items = bankQuestions('geo', 5, 'x').map(({ q, a, c }) => ({ q, a, c }));
  const good = await qz.onTurn(s, { me: 'a', sample: { json: async () => items } });
  assert.equal(good.by, 'claude');
  assert.equal(good.items.length, 5);
  for (const it of good.items) assert.equal(it.a[it.c], items.find((x) => x.q === it.q).a[items.find((x) => x.q === it.q).c]);
  let warned = '';
  const bad = await qz.onTurn(s, { me: 'a', toast: (t) => { warned = t; }, sample: { json: async () => { throw { code: 'not_granted' }; } } });
  assert.equal(bad.by, 'bank');
  assert.match(warned, /вградените/);
  assert.equal(await qz.onTurn(s, { me: 'b', startedAt: Date.now() - 60000 }).then((m) => m.by), 'bank', 'друг играч след 45 сек.');
});
