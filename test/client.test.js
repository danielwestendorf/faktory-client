const debug = require('debug')('faktory-client:test');
const test = require('ava');
const Client = require('../lib/client');
const crypto = require('crypto');
const {
  spawnFaktory,
  shutdownFaktory,
  createJob,
  createClient: create,
  queueName,
  withConnection: connect
} = require('./support/helper');

test.before(async () => {
  await spawnFaktory();
  await connect((client) => {
    return client.flush();
  });
});

test.after.always(async () => {
  await connect((client) => {
    return client.flush();
  });
  shutdownFaktory();
});

test('client defaults to localhost', (t) => {
  const client = create();
  t.is(client.host, 'localhost', 'host is localhost');
});

test('client defaults to port 7419', (t) => {
  const client = create();
  t.is(client.port, 7419, 'port is 7419');
});

test('client builds a passwordless ahoy', (t) => {
  const client = create();
  const hello = client.buildHello({});
  t.truthy(hello.hostname, 'hostname is present');
});

test('wid is present in ahoy', (t) => {
  const wid = 'workerid';
  const client = create({ wid });
  const hello = client.buildHello({});
  t.is(hello.wid, wid, 'wid in ahoy does not match');
});

test('pid is present when wid is given in ahoy', (t) => {
  const client = create();
  const hello = client.buildHello({});
  t.truthy(!hello.pid, 'pid should not be present');
});

test('labels are passed in ahoy', (t) => {
  const labels = ['hippo'];
  const client = create({ labels });
  const hello = client.buildHello({});
  t.deepEqual(hello.labels, labels, 'hello does not includes labels correctly');
});

test('checkVersion throws when version mismatch', (t) => {
  t.throws(() => {
    Client.checkVersion(3);
    Client.checkVersion(1);
  });
  t.notThrows(() => {
    Client.checkVersion(2);
  }, 'does not throw when version does not match');
});

test('client logs when a reply is received with no command', (t) => {
  const client = create();
  t.true(client.queue.length === 0);
  t.throws(() => {
    client.receive('OK');
  });
});

test('client builds a hex pwdhash with salt', (t) => {
  const iterations = 10;
  const password = 'password1';
  const salt = 'dozens';
  const client = create({ password });
  const hello = client.buildHello({ s: salt, i: iterations });
  let hash = crypto.createHash('sha256').update(password + salt);

  for (let i = 1; i < iterations; i++) {
    hash = crypto.createHash('sha256').update(hash.digest());
  }

  t.is(hello.pwdhash, hash.digest('hex'), 'pwdhash not generated correctly');
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
    for (let i = 5; i > 0; i--) {
      const info = await client.info();
      t.truthy(info.faktory, `reply ${i} ok`);
    }
  });
});

test('client serial pushes', async (t) => {
  await connect(async (client) => {
    for (let i = 4; i > 0; i--) {
      t.truthy(await client.push(createJob(i)));
    }
  });
});

test('client concurrent pushes', async (t) => {
  await connect(async (client) => {
    const args = [0, 1, 2, 3, 4];
    const responses = await Promise.all(
      args.map((i) => client.push(createJob(i)))
    );
    t.is(responses.length, args.length);
    responses.forEach((resp) => t.truthy(resp));
  });
});

test('client fetches', async (t) => {
  await connect(async (client) => {
    const job = createJob(123456);
    t.truthy(await client.push(job));

    let fetched = await client.fetch(job.queue);

    t.truthy(fetched);
    t.truthy(fetched.jid, 'job has jid');
    t.deepEqual(fetched.args, job.args, 'args are the same');
    t.is(fetched.jobtype, job.jobtype);
  });
});

test('client rejects when expectation doesn\'t match response', async (t) => {
  await connect((client) => {
    return t.throws(client.send(['PUSH', createJob()], 'NOT OK'));
  });
});

test('client resolves when connect is called after connection', async (t) => {
  await connect(async (client) => {
    t.true(client.connected);
    t.is(await client.connect(), client);
  });
});

test('client sends a heartbeat successfully', async (t) => {
  await connect({ wid: '12345678' }, async (client) => {
    t.is(await client.beat(), 'OK');
  });
});

test('client ACKs a job', async (t) => {
  await connect(async (client) => {
    const job = createJob();
    await client.push(job);
    const fetched = await client.fetch(job.queue);
    t.is(await client.ack(fetched.jid), 'OK');
  });
});

test('client FAILs a job', async (t) => {
  await connect(async (client) => {
    const job = createJob();
    await client.push(job);
    const fetched = await client.fetch(job.queue);
    t.is(await client.fail(fetched.jid, new Error('EHANGRY')), 'OK');
    // assert error data...
  });
});

process.on('exit', () => {
  shutdownFaktory();
});
