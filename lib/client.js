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
const [ FAKTORY_HOST, FAKTORY_PORT ] = FAKTORY_URL.split(':');
let password;

module.exports = class Client {

  constructor(options = {}) {
    password = options.password;
    this.queue = [];
    this.host = options.host || FAKTORY_HOST || 'localhost';
    this.port = options.port || FAKTORY_PORT || 7419;
    this.wid = uuid().slice(0, 8);
  }

  debug(msg) {
    debug(`wid=${this.wid} ${msg}`);
  }

  static create(...args) {
    return new Client(...args);
  }

  connect() {
    // called during connecting?
    if (this.connected) {
      return Promise.resolve(this);
    }

    this.debug(`Connecting to server`);

    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.port, this.host, async () => {
        this.connected = true;
        this.debug(`Connected`);

        await this.listen().handshake();
        resolve(this);
      });
      this.socket.setTimeout(30000);
    });
  }

  handshake() {
    this.debug('Shaking hands');

    return new Promise((resolve, reject) => {
      const sayHello = async (err, { text, payload: greeting }) => {
        if (err) {
          return reject(err);
        }
        this.checkVersion(greeting.v);

        const hello = this.buildHello(greeting.s);
        resolve(await this.send(['HELLO', hello], 'OK'));
      }

      this.queue.push({ callback: sayHello });
    });
  }

  buildHello(salt) {
    const hello = {
      hostname: os.hostname(),
      wid: this.wid,
      pid: process.pid,
      labels: []
    };

    if (salt) {
      hello['pwdhash'] = crypto
        .createHash('sha256')
        .update(`${password}${salt}`)
        .digest('hex');
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
      .on('data', (buffer) => parser.execute(buffer))
      .on('close', () => {
        this.debug('Connection closed');
        this.connected = false;
        this.shutdown();
      })
      .on('timeout', /* istanbul ignore next */ () => {
        this.debug('Connection timed out');
        this.shutdown();
      })
      .on('error', /* istanbul ignore next */ (e) => console.error(e));

    return this;
  }

  checkVersion(version) {
    if (version !== FAKTORY_VERSION_COMPAT) {
      throw new Error(`
  Client / server version mismatch
  Client: ${FAKTORY_VERSION_COMPAT} Server: ${version}
`);
    }
  }

  send(command, expectation) {
    let encoded = command.map((item) => {
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
            return reject(
              new Error(`Expected response: ${expectation}, got: ${resp.text}`)
            );
          }
          this.debug(`SENT: ${command}, GOT: ${JSON.stringify(resp)}`);
          resolve(resp);
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
      console.error(`!!!!! Dropped response! ${response}`);
      return;
    }

    try {
      response = this.parse(data);
    } catch(e) {
      error = e;
    }

    command.callback(error, response);
  }

  receiveError(err) {
    this.queue.shift().callback(err);
  }

  parse(data) {
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

  async fetch(...queues) {
    const { payload: job } = await this.send(['FETCH', ...queues]);
    return job;
  }

  async beat() {
    const { text } = await this.send(['BEAT', { wid: this.wid }]);
    return text;
  }

  async push(job) {
    const jobWithJid = Object.assign(
      {},
      job, {
        jid: uuid()
      }
    );
    const { text } = await this.send(['PUSH', jobWithJid], 'OK');
    return text;
  }

  async flush() {
    // WARNING: this will empty your rocks database
    const { text } = await this.send(['FLUSH']);
    return text;
  }

  async info() {
    const { payload: info } = await this.send(['INFO']);
    return info;
  }

  async shutdown() {
    this.connected = false;
    if (!this.socket || this.socket.destroyed) {
      return;
    }
    // await this.send(['END']);
    this.socket.destroy();
  }

}
