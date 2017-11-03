const net = require('net');
const utils = require('util');
const crypto = require('crypto');
const uuid = require('uuid/v4');
const os = require('os');

const RedisParser = require('redis-parser');
const debug = require('debug')('faktory-client');

const FAKTORY_VERSION_COMPAT = '1';
const FAKTORY_PROVIDER = process.env.FAKTORY_PROVIDER || 'FAKTORY_URL';
const FAKTORY_URL = process.env[FAKTORY_PROVIDER] || '';
const [FAKTORY_HOST, FAKTORY_PORT] = FAKTORY_URL.split(':');

module.exports = class Client {
  constructor(options = {}) {
    this.password = options.password;
    this.labels = options.labels || [];
    this.queue = [];
    this.host = options.host || FAKTORY_HOST || 'localhost';
    this.port = options.port || FAKTORY_PORT || 7419;
    this.wid = uuid().slice(0, 8);
  }

  static checkVersion(version) {
    if (version !== FAKTORY_VERSION_COMPAT) {
      throw new Error(`
  Client / server version mismatch
  Client: ${FAKTORY_VERSION_COMPAT} Server: ${version}
`);
    }
  }

  static parse(data) {
    let response;

    if (data.startsWith('HI ')) {
      response = {
        text: 'HI',
        payload: JSON.parse(data.slice(3))
      };
    } else if (data.startsWith('{')) {
      response = {
        payload: JSON.parse(data)
      };
    } else {
      response = { text: data };
    }

    return response;
  }

  static create(...args) {
    return new Client(...args);
  }

  connect() {
    // called during connecting?
    if (this.connected) {
      return Promise.resolve(this);
    }

    this.debug('Connecting to server');

    return new Promise((resolve) => {
      this.socket = net.createConnection(this.port, this.host, async () => {
        this.connected = true;
        this.debug('Connected');
        this.listen();
        await this.handshake();
        resolve(this);
      });
      this.socket.setTimeout(30000);
    });
  }

  handshake() {
    this.debug('Shaking hands');

    return new Promise((resolve, reject) => {
      const sayHello = async (err, { payload: greeting }) => {
        if (err) {
          return reject(err);
        }

        Client.checkVersion(greeting.v);

        const hello = this.buildHello(greeting.s);
        return resolve(await this.send(['HELLO', hello], 'OK'));
      };

      this.queue.push({ callback: sayHello });
    });
  }

  buildHello(salt) {
    const hello = {
      hostname: os.hostname(),
      wid: this.wid,
      pid: process.pid,
      labels: this.labels
    };

    if (salt) {
      hello.pwdhash = crypto
        .createHash('sha256')
        .update(`${this.password}${salt}`)
        .digest('hex');
    }

    return hello;
  }

  createParser() {
    return new RedisParser({
      returnReply: this.receive.bind(this),
      returnError: this.receiveError.bind(this),
      returnFatalError: /* istanbul ignore next */ (err) => {
        this.close();
        throw err;
      }
    });
  }

  listen() {
    const parser = this.createParser();

    this.socket
      .on('data', buffer => parser.execute(buffer))
      .on('close', () => {
        this.debug('Connection closed');
        this.connected = false;
      })
      .on('timeout', /* istanbul ignore next */ () => {
        this.debug('Connection timed out');
        this.close();
      })
      .on('error', /* istanbul ignore next */ e => console.error(e));

    return this;
  }

  send(command, expectation) {
    if (!this.socket.writable) {
      throw new Error('Socket not writable');
    }

    const encoded = command.map((item) => {
      if ({}.toString.call(item) === '[object Object]') {
        return JSON.stringify(item);
      }
      return item;
    });

    return new Promise((resolve, reject) => {
      const commandString = encoded.join(' ');
      this.debug(`SEND: ${commandString}`);

      this.queue.push({
        command,
        callback: (err, resp) => {
          if (err) {
            return reject(err);
          } else if (expectation && resp.text !== expectation) {
            return reject(new Error(`Expected response: ${expectation}, got: ${resp.text}`));
          }
          this.debug(`SENT: ${command}, GOT: ${JSON.stringify(resp)}`);
          return resolve(resp);
        }
      });

      this.socket.write(commandString);
      this.socket.write('\r\n');
    });
  }

  receive(data) {
    this.debug(`RECEIVE: ${utils.inspect(data)}`);

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

  async fetch(...queues) {
    const { payload } = await this.send(['FETCH', ...queues]);
    return payload;
  }

  async beat() {
    const { text } = await this.send(['BEAT', { wid: this.wid }]);
    return text;
  }

  async push(job) {
    const jid = uuid();
    const { text } = await this.send(
      ['PUSH', Object.assign({}, job, { jid })],
      'OK'
    );
    return text === 'OK' && jid;
  }

  async flush() {
    // WARNING: this will empty your rocks database
    const { text } = await this.send(['FLUSH']);
    return text;
  }

  async info() {
    const { payload } = await this.send(['INFO']);
    return payload;
  }

  async ack(jid) {
    if (typeof jid !== 'string') {
      throw new Error('jid must be a string');
    }
    const { text } = await this.send(['ACK', { jid }], 'OK');
    return text;
  }

  async fail(jid, e) {
    if (typeof jid !== 'string') {
      throw new Error('jid must be a string');
    }
    const { text } = await this.send([
      'FAIL',
      {
        message: e.message,
        errtype: e.code,
        backtrace: e.stack.split('\n').slice(0, 100),
        jid
      }
    ], 'OK');
    return text;
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

  debug(msg) {
    debug(`wid=${this.wid} ${msg}`);
  }
};
