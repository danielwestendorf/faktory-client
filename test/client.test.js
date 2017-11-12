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
  const hello = client.buildHello();
  t.truthy(hello.hostname, 'hostname is present');
});

test('wid is present in ahoy', (t) => {
  const client = create();
  const hello = client.buildHello();
  t.is(hello.wid.length, 8, 'wid is present');
});

test('pid is present in ahoy', (t) => {
  const client = create();
  const hello = client.buildHello();
  t.truthy(hello.pid, 'pid is present');
});

test('labels are passed in ahoy', (t) => {
  const labels = ['hippo'];
  const client = create({ labels });
  const hello = client.buildHello();
  t.deepEqual(hello.labels, labels);
});

test('checkVersion throws when version mismatch', (t) => {
  t.throws(() => {
    // 2 is not supported at this time
    Client.checkVersion('2');
  });
  t.notThrows(() => {
    Client.checkVersion('1');
  });
});

test('client logs when a reply is received with no command', (t) => {
  const client = create();
  t.true(client.queue.length === 0);
  t.throws(() => {
    client.receive('OK')
  });
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
  await connect(async (client) => {
    // response is 'OK'
    await t.throws(client.send(['PUSH', createJob()], 'NOT OK'));
  });
});

test('client resolves when connect is called after connection', async (t) => {
  await connect(async (client) => {
    t.true(client.connected);
    t.is(await client.connect(), client);
  });
});

test('client sends a heartbeat successfully', async (t) => {
  await connect(async (client) => {
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
