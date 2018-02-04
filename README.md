# faktory-client

[![Travis branch](https://img.shields.io/travis/jbielick/faktory-client/master.svg)](https://travis-ci.org/jbielick/faktory-client)
[![Coveralls github branch](https://img.shields.io/coveralls/github/jbielick/faktory-client/master.svg)](https://coveralls.io/github/jbielick/faktory-client)
[![David](https://img.shields.io/david/jbielick/faktory-client.svg)](#)
[![node](https://img.shields.io/node/v/faktory-client.svg)]()

A node.js client for the Faktory job server

This repository provides a node.js client for [Faktory](https://github.com/contribsys/faktory). The client allows you to push jobs, fetch jobs, and otherwise communicate with the Faktory server.

**If you're looking for a faktory worker framework for node.js, take a look at [`jbielick/faktory_worker_node`](https://github.com/jbielick/faktory_worker_node). This is just the connection client library.**

## Installation

```
npm install faktory-client
```

## Usage

`faktory-client` implements a promise interface for all async methods.

### Pushing jobs

```js
const client = require('faktory-client').create();

await client.connect();
await client.push({
  jobtype: 'MyJobName',
  queue: 'critical', // `default` if omitted
  args: [1]
});
```

### Fetching jobs

```js
const client = require('faktory-client').create({ labels: ['hungry'] });

await client.connect();
// fetches from each queue in order, blocking for 2s on each if they are empty
const job = await client.fetch('default', 'critical', 'low');

job.jid
// 8ec88fc8-5060-451c-8ebb-efd4cb9c4a97

await client.ack(job.jid);
// or
await client.fail(job.jid, new Error('guess again!'));
```

See [tests](test) for more examples.

## FAQ

* How do I specify the Faktory server location?

By default, it will use localhost:7419 which is sufficient for local development.
Use FAKTORY_URL to specify the URL, e.g. `faktory.example.com:12345` or
use FAKTORY_PROVIDER to specify the environment variable which does
contain the URL: FAKTORY_PROVIDER=FAKTORYTOGO_URL.  This level of
indirection is useful for SaaSes, Heroku Addons, etc.

See the [Faktory client for other languages](https://github.com/contribsys/faktory/wiki/Related-Projects)

## TODO

- [x] Heartbeats
- [x] Reconnects
- [x] Connection interrupt graceful shutdown
- [x] Quiet/Stop signal handling from server
- [ ] TLS

## Development

Install docker.

`bin/server` will run the faktory server in a docker container. The server is available at `localhost:7419`

Use `DEBUG=faktory*` to see debug lines.

## Tests

Start a faktory server on localhost or use `bin/server`.

`npm test` will run the tests concurrently with ava.

## Author

Josh Bielick, @jbielick
