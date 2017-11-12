const net = require('net');
const utils = require('util');
const crypto = require('crypto');
const uuid = require('uuid/v4');
const os = require('os');

const RedisParser = require('redis-parser');
const debug = require('debug')('faktory-client');

const FAKTORY_PROTOCOL_VERSION = 2;
const FAKTORY_PROVIDER = process.env.FAKTORY_PROVIDER || 'FAKTORY_URL';
const FAKTORY_URL = process.env[FAKTORY_PROVIDER] || '';
const [FAKTORY_HOST, FAKTORY_PORT] = FAKTORY_URL.split(':');

module.exports = class Client {
  constructor(options = {}) {
    this.password = options.password;
    this.labels = options.labels || [];
    this.wid = options.wid;
    this.queue = [];
    this.host = options.host || FAKTORY_HOST || 'localhost';
    this.port = options.port || FAKTORY_PORT || 7419;
  }

  static checkVersion(version) {
    if (Number(version) !== FAKTORY_PROTOCOL_VERSION) {
      throw new Error(`
  Client / server version mismatch
  Client: ${FAKTORY_PROTOCOL_VERSION} Server: ${version}
`);
    }
  }

  static parse(data) {
    if (data.startsWith('HI ')) {
      return {
        text: 'HI',
        payload: JSON.parse(data.slice(3))
      };
    }

    if (data.startsWith('{')) {
      return {
        payload: JSON.parse(data)
      };
    }

    return { text: data };
  }

  static hash(pwd, salt, iterations) {
    let hash = crypto
      .createHash('sha256')
      .update(pwd + salt);

    if (iterations > 1) {
      for (let i = 1; i < iterations; i += 1) {
        hash = crypto
          .createHash('sha256')
          .update(hash.digest());
      }
    }
    return hash.digest('hex');
  }

  connect() {
    if (this.connected) {
      return Promise.resolve(this);
    }

    debug('Connecting to server');

    return new Promise((resolve) => {
      this.socket = net.createConnection(this.port, this.host, async () => {
        this.connected = true;
        debug('Connected');
        this.listen();
        await this.handshake();
        resolve(this);
      });
      this.socket.setTimeout(30000);
    });
  }

  handshake() {
    debug('Shaking hands');

    return new Promise((resolve, reject) => {
      const sayHello = async (err, { payload: greeting }) => {
        if (err) {
          return reject(err);
        }

        Client.checkVersion(greeting.v);

        const hello = this.buildHello(greeting);
        return resolve(await this.send(['HELLO', hello], 'OK'));
      };

      this.queue.push({ callback: sayHello });
    });
  }

  buildHello({ s: salt, i: iterations }) {
    const hello = {
      hostname: os.hostname(),
      labels: this.labels,
      v: FAKTORY_PROTOCOL_VERSION
    };

    if (this.wid) {
      hello.pid = process.pid;
      hello.wid = this.wid;
    }

    if (salt) {
      hello.pwdhash = Client.hash(this.password, salt, iterations);
    }

    return hello;
  }

  createParser() {
    return new RedisParser({
      returnReply: this.receive.bind(this),
      returnError: this.receiveError.bind(this),
      returnFatalError: /* istanbul ignore next */ (err) => {
        this.shutdown();
        throw err;
      }
    });
  }

  listen() {
    const parser = this.createParser();

    this.socket
      .on('data', buffer => parser.execute(buffer))
      .on('close', () => {
        debug('Connection closed');
        this.connected = false;
      })
      .on('timeout', /* istanbul ignore next */ () => {
        debug('Connection timed out');
        this.shutdown();
      })
      .on('error', /* istanbul ignore next */ e => console.error(e));

    return this;
  }

  send(command, expectation) {
    const encoded = command.map((item) => {
      if ({}.toString.call(item) === '[object Object]') {
        return JSON.stringify(item);
      }
      return item;
    });

    return new Promise((resolve, reject) => {
      const commandString = encoded.join(' ');

      debug(`SEND: ${commandString}`);
      this.socket.write(`${commandString}\r\n`);

      this.queue.push({
        command,
        callback: (err, resp) => {
          if (err) {
            return reject(err);
          } else if (expectation && resp.text !== expectation) {
            return reject(new Error(`Expected response: ${expectation}, got: ${resp.text}`));
          }
          debug(`SENT: ${command}, GOT: ${JSON.stringify(resp)}`);
          return resolve(resp);
        }
      });
    });
  }

  receive(data) {
    debug(`RECEIVE: ${utils.inspect(data)}`);

    const command = this.queue.shift();
    let response;
    let error;

    if (!command) {
      throw new Error(`Queue empty. Dropped response! ${response}`);
    }

    try {
      response = Client.parse(data);
    } catch (e) {
      error = e;
    }

    command.callback(error, response);
  }

  receiveError(err) {
    this.queue.shift().callback(err);
  }

  fetch(...queues) {
    return this.send(['FETCH', ...queues]).then(res => res.payload);
  }

  /**
   * Send a heartbit for this.wid to the server
   * @return {String|Object} string 'OK' when the heartbeat is accepted, otherwise
   *                                may return an object { state: '...' } when the
   *                                server has a signal to send this client
   */
  beat() {
    return this.send(['BEAT', { wid: this.wid }]).then(res => res.text || res.payload.state);
  }

  push(job) {
    const jid = job.jid || uuid();
    const payload = Object.assign({ jid }, job);
    return this.send(['PUSH', payload], 'OK').then(() => jid);
  }

  flush() {
    return this.send(['FLUSH']).then(res => res.text);
  }

  info() {
    return this.send(['INFO']).then(res => res.payload);
  }

  ack(jid) {
    return this.send(['ACK', { jid }], 'OK').then(res => res.text);
  }

  fail(jid, e) {
    return this.send([
      'FAIL',
      {
        message: e.message,
        errtype: e.code,
        backtrace: e.stack.split('\n').slice(0, 100),
        jid
      }
    ], 'OK').then(res => res.text);
  }

  async close() {
    if (!this.socket || this.socket.destroyed) {
      return;
    }
    this.socket.end('END');
    this.connected = false;
  }

  async shutdown() {
    return this.close();
  }
};
