const debug = require('debug')('faktory-client:test-helper');
const { spawn } = require('child_process');
const uuid = require('uuid/v4');
const Client = require('../../lib/client');
let faktoryProcess;
let started = false;

const createClient = (opts) => new Client(opts);

const withConnection = async (opts, cb) => {
  if (!cb && opts) {
    cb = opts;
    opts = undefined;
  }

  const client = createClient(opts);

  debug('Connecting');
  await client.connect();

  try {
    return await cb(client);
  } catch(e) {
    throw e;
  } finally {
    debug('Shutting down client');
    await client.shutdown();
  }
};

const getInfo = (conn) => {
  return conn.send(['INFO']);
};

const queueName = (label = 'test') => {
  return `${label}-${uuid().slice(0, 6)}`;
};

const createJob = (...args) => {
  return {
    jobtype: 'testJob',
    queue: queueName(),
    args
  };
};

const spawnFaktory = () => {
  return new Promise((resolve, reject) => {
    debug('Spawning Faktory');

    faktoryProcess = spawn(
      'docker',
      [
        'run',
        '--rm',
        '-p',
        '7419:7419',
        'contribsys/faktory:0.6.0',
        '-b',
         ':7419'
      ]
    );

    faktoryProcess.stderr.on('data', (data) => {
      console.log(data.toString());
    });

    faktoryProcess.stdout.on('data', (data) => {
      const message = data.toString();
      debug(message);
      if (!started && /Now listening at :/.test(message)) {
        started = true;
        resolve(faktoryProcess);
      }
    })

    faktoryProcess.on('error', (err) => {
      console.err(err);
      debug('Failed to start Faktory');
      reject(err);
    });

    faktoryProcess.on('exit', (code) => {
      started = false;
      if (code !== 0) {
        reject(new Error(`Faktory exited with code ${code}`));
      }
    });
  });

  return ls;
};

const shutdownFaktory = () => {
  if (faktoryProcess && started) {
    debug('Signaling Faktory');
    faktoryProcess.kill();
  }
};

module.exports = {
  queueName,
  createClient,
  createJob,
  withConnection,
  spawnFaktory,
  shutdownFaktory
};
