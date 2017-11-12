const debug = require('debug')('faktory-client:test-helper');
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

module.exports = {
  queueName,
  createClient,
  createJob,
  withConnection
};
