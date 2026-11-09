import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { databaseHost, readLocalMemberRequest } from './ensure-local-member';

const localEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'mysql://app:secret@127.0.0.1:3306/haichuan',
  LOCAL_MEMBER_USERNAME: 'Haichuan_01',
  LOCAL_MEMBER_PASSWORD: 'local9pass',
};

describe('本机会员脚本', () => {
  it('只解析主机名，不回传连接串里的口令', () => {
    assert.equal(databaseHost(localEnv.DATABASE_URL), '127.0.0.1');
    assert.equal(databaseHost('mysql://127.0.0.1:3306/haichuan'), '127.0.0.1');
    assert.equal(databaseHost('mysql://[::1]:3306/haichuan'), '[::1]');
  });

  it('接受本机库，并把用户名规范成小写', () => {
    assert.deepEqual(readLocalMemberRequest(localEnv), {
      username: 'haichuan_01',
      password: 'local9pass',
      name: '海川',
    });
  });

  it('拒绝生产环境、远程库、缺口令和无效用户名', () => {
    assert.throws(() => readLocalMemberRequest({ ...localEnv, NODE_ENV: 'production' }), /生产环境/);
    assert.throws(
      () => readLocalMemberRequest({ ...localEnv, DATABASE_URL: 'mysql://app:secret@db.example:3306/haichuan' }),
      /本机数据库/,
    );
    assert.throws(() => readLocalMemberRequest({ ...localEnv, LOCAL_MEMBER_PASSWORD: '' }), /密码/);
    assert.throws(() => readLocalMemberRequest({ ...localEnv, LOCAL_MEMBER_USERNAME: '1bad' }), /用户名/);
  });
});
