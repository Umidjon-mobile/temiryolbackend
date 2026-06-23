/**
 * Operator balans pure-math unit testlari (DB kerak emas).
 * Ishga tushirish:
 *   npx ts-node-dev -r tsconfig-paths/register --transpile-only src/modules/operator/operator-balance.test.ts
 *   yoki:  npm run test:operator
 *
 * Spec stsenariylari (8–11) shu yerda qoplanadi.
 */
import assert from 'node:assert/strict';
import { computeConsume, computeReceive, computeReverse } from './operator-balance.service';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error('    ', (err as Error).message);
    process.exitCode = 1;
  }
}

console.log('Operator balans testlari:\n');

// 8. balance 1000, consume 600 → 400
test('1000 zaxira, 600 berildi → 400 qoladi (overlimit 0)', () => {
  const r = computeConsume({ balanceKg: 1000, overlimitKg: 0 }, 600);
  assert.equal(r.balanceKg, 400);
  assert.equal(r.overlimitKg, 0);
});

// 9. balance 1000, consume 1100 → balance 0, overlimit 100
test('1000 zaxira, 1100 berildi → balans 0, overlimit 100', () => {
  const r = computeConsume({ balanceKg: 1000, overlimitKg: 0 }, 1100);
  assert.equal(r.balanceKg, 0);
  assert.equal(r.overlimitKg, 100);
});

// 10. overlimit 100, receive 500 → overlimit 0, balance 400
test('overlimit 100, 500 qabul → avval overlimit yopiladi, 400 balansga', () => {
  const r = computeReceive({ balanceKg: 0, overlimitKg: 100 }, 500);
  assert.equal(r.overlimitKg, 0);
  assert.equal(r.balanceKg, 400);
});

// Receive overlimitdan kam bo'lsa — faqat overlimit kamayadi
test('overlimit 300, 100 qabul → overlimit 200, balans 0', () => {
  const r = computeReceive({ balanceKg: 0, overlimitKg: 300 }, 100);
  assert.equal(r.overlimitKg, 200);
  assert.equal(r.balanceKg, 0);
});

// Receive overlimit yo'q paytda — to'liq balansga
test('zaxira 200, 800 qabul → balans 1000', () => {
  const r = computeReceive({ balanceKg: 200, overlimitKg: 0 }, 800);
  assert.equal(r.balanceKg, 1000);
  assert.equal(r.overlimitKg, 0);
});

// Aniq balansga teng consume → 0
test('1000 zaxira, 1000 berildi → balans 0, overlimit 0', () => {
  const r = computeConsume({ balanceKg: 1000, overlimitKg: 0 }, 1000);
  assert.equal(r.balanceKg, 0);
  assert.equal(r.overlimitKg, 0);
});

// 11. Izolyatsiya — ikki mustaqil zapravka holati bir-biriga ta'sir qilmaydi
test('izolyatsiya: bir zapravka consume boshqasiga ta\'sir qilmaydi', () => {
  const toshkent = { balanceKg: 1000, overlimitKg: 0 };
  const angren = { balanceKg: 500, overlimitKg: 0 };
  const t2 = computeConsume(toshkent, 600);
  assert.equal(t2.balanceKg, 400);
  assert.equal(angren.balanceKg, 500); // o'zgarmadi
});

// Reverse (o'chirish) — berilgan yoqilg'i qaytadi, avval qarz yopiladi
test('reverse: balans 0 / overlimit 100 da 100 qaytsa → balans 0, overlimit 0', () => {
  const r = computeReverse({ balanceKg: 0, overlimitKg: 100 }, 100);
  assert.equal(r.balanceKg, 0);
  assert.equal(r.overlimitKg, 0);
});

// consume keyin to'liq reverse → boshlang'ich holatga qaytadi
test('consume(700) keyin reverse(700) → boshlang\'ich holat (1000/0)', () => {
  const start = { balanceKg: 1000, overlimitKg: 0 };
  const afterConsume = computeConsume(start, 700);
  const afterReverse = computeReverse(afterConsume, 700);
  assert.equal(afterReverse.balanceKg, 1000);
  assert.equal(afterReverse.overlimitKg, 0);
});

// overlimitli consume keyin reverse → boshlang'ich holatga qaytadi
test('1000 zaxira, consume(1100) → reverse(1100) → 1000/0', () => {
  const start = { balanceKg: 1000, overlimitKg: 0 };
  const afterConsume = computeConsume(start, 1100); // 0 / 100
  const afterReverse = computeReverse(afterConsume, 1100); // 1000 / 0
  assert.equal(afterReverse.balanceKg, 1000);
  assert.equal(afterReverse.overlimitKg, 0);
});

// Kasrli (12,5 → 12.5) aniqlik
test('kasrli qiymat: 1000 zaxira, 12.5 berildi → 987.5', () => {
  const r = computeConsume({ balanceKg: 1000, overlimitKg: 0 }, 12.5);
  assert.equal(r.balanceKg, 987.5);
});

console.log(`\n${passed} ta test o'tdi${process.exitCode ? ' (XATOLAR BOR)' : ' ✓'}\n`);
