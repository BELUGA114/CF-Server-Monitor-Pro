import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseInitializer } from '../src/db/schema.js';

function database() {
  const queries = [];
  return {
    queries,
    prepare(sql) {
      queries.push(sql);
      return {
        run: async () => {},
        all: async () => ({ results: [{ name: 'agent_os' }] }),
        first: async () => ({ value: '{}' }),
      };
    },
  };
}

test('旧 schema 补充指标列，成功初始化后同一个 Worker 不重复执行', async () => {
  const initialize = createDatabaseInitializer();
  const db = database();
  await initialize(db);
  for (const column of ['loss_ct', 'monthly_rx', 'history', 'is_hidden', 'reset_day']) {
    assert.ok(db.queries.some(sql => sql.includes('ALTER TABLE servers ADD COLUMN ' + column + ' ')));
  }
  assert.ok(!db.queries.some(sql => sql.includes('ALTER TABLE servers ADD COLUMN agent_os ')));
  const count = db.queries.length;
  await initialize(db);
  assert.equal(db.queries.length, count);
  const otherDb = database();
  await createDatabaseInitializer()(otherDb);
  assert.ok(otherDb.queries.length > 0);
});

test('数据库初始化失败后，下一次请求仍能重试', async () => {
  const initialize = createDatabaseInitializer();
  await initialize({ prepare() { throw new Error('D1 暂时不可用'); } });
  const db = database();
  await initialize(db);
  assert.ok(db.queries.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS servers')));
});
