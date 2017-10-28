const debug = require('debug')('faktory-client:test');
const test = require('ava');
const Client = require('../lib/client');
const crypto = require('crypto');
const {
  spawnFaktory,
  shutdownFaktory,
  createClient: create,
  queueName,
  withConnection: connect
} = require('./support/helper');

(async () => {

  test.before(async () => {
    await spawnFaktory();
  });

  test.after.always(async () => {
    await connect(async (client) => {
      await client.flush();
    });
    shutdownFaktory();
  });

  test('Client.create returns a client', (t) => {
    t.is(Client.create().constructor, Client);
  });

  test('client has a wid from construction', (t) => {
    const client = create();
    t.truthy(client.wid, 'wid is present');
    t.true(client.wid.length >= 8, 'wid is length 6');
  });

  test('client defaults to localhost', (t) => {
    const client = create();
    t.is(client.host, 'localhost', 'host is localhost');
  });

  test('client defaults to port 7419', (t) => {
    const client = create();
    t.is(client.port, 7419, 'port is 7419');
  });

  test('client builds a passwordless hello', (t) => {
    const client = create();
    const hello = client.buildHello();
    t.truthy(hello.hostname, 'hostname is present');
  });

  test('wid is present', (t) => {
    const client = create();
    const hello = client.buildHello();
    t.truthy(hello.wid, 'wid is present');
  });

  test('pid is present', (t) => {
    const client = create();
    const hello = client.buildHello();
    t.truthy(hello.pid, 'pid is present');
  });

  test('labels are present', (t) => {
    const client = create();
    const hello = client.buildHello();
    t.truthy(hello.labels, 'labels are present');
  });

  test('checkVersion throws when version mismatch', (t) => {
    const client = create();
    t.throws(() => {
      // 2 is not supported at this time
      client.checkVersion('2');
    });
  });

  test('client logs when a reply is received with no command', (t) => {
    const client = create();
    t.true(client.queue.length === 0);
    t.falsy(client.receive('OK'));
  });

  test('client builds a hex pwdhash with salt', (t) => {
    const password = 'password1';
    const salt = 'dozens';
    const client = create({ password });
    const hello = client.buildHello(salt);
    const hash = crypto
      .createHash('sha256')
      .update(password + salt)
      .digest('hex');

    t.is(hello.pwdhash, hash, 'pwdhash created correctly');
  });

  test('client send and reply INFO', async (t) => {
    await connect(async (client) => {
      const info = await client.info();
      t.truthy(info.faktory, 'faktory data is present in info');
      t.truthy(info.server_utc_time, 'server includes timestamp in info');
    });
  });

  test('client subsequent serial requests', async (t) => {
    await connect(async (client) => {
      for (let i = 5; i >= 0; i--) {
        const info = await client.info();
        t.truthy(info.faktory, `reply ${i} ok`);
      }
    });
  });

  test('client concurrent requests', async (t) => {
    await connect(async (client) => {
      const args = [0, 1, 2, 3, 4];
      const responses = await Promise.all(
        args.map((i) => {
          return client.push({
            jobtype: 'testJob',
            queue: queueName('client-concurrent-requests'),
            args: [i]
          });
        })
      );
      const oks = responses.filter((text) => text === 'OK');
      t.is(oks.length, args.length);
    });
  });

  test('client push', async (t) => {
    await connect(async (client) => {
      t.pass();
    });
  });

  test('client serial pushes', async (t) => {
    await connect(async (client) => {
      for (let i = 4; i >= 0; i--) {
        const resp = await client.push({
          jobtype: 'testJob',
          queue: queueName('client-serial-pushes'),
          args: [i]
        });
        t.is(resp, 'OK');
      }
    });
  });

  test('client concurrent pushes', async (t) => {
    await connect(async (client) => {
      const args = [0, 1, 2, 3, 4];
      const responses = await Promise.all(
        args.map((i) => {
          return client.push({
            jobtype: 'testJob',
            queue: queueName('client-concurrent-pushes'),
            args: [i]
          });
        })
      );
      t.deepEqual(responses, args.map(() => 'OK'));
    });
  });

  test('client fetches', async (t) => {
    await connect(async (client) => {
      const queue = queueName('client-fetches');
      const args = [123456];
      const job = {
        jobtype: 'myJob',
        queue,
        args
      };
      t.is(await client.push(job), 'OK');

      let fetched = await client.fetch(queue);

      t.truthy(fetched);
      t.truthy(fetched.jid, 'job has jid');
      t.deepEqual(fetched.args, job.args, 'args are the same');
      t.is(fetched.jobtype, job.jobtype);
    });
  });

  test('client rejects when expectation doesn\'t match response', async (t) => {
    await connect(async (client) => {
      const queue = queueName('expectation-throw');
      const job = {
        jobtype: 'testJob',
        queue,
        args: []
      };
      // response is 'OK'
      await t.throws(client.send(['PUSH', job], 'NOT OK'));
    });
  });

  test('client resolves when connect is called after connection', async (t) => {
    await connect(async (client) => {
      t.true(client.connected);
      t.is(await client.connect(), client);
    });
  });

  test('client sends a heartbeat correctly', async (t) => {
    await connect(async (client) => {
      t.is(await client.beat(), 'OK');
    });
  });

  test.todo('same connection used concurrently');

})();

process.on('exit', () => {
  shutdownFaktory();
});
