# faktory-client

[![Travis branch](https://img.shields.io/travis/jbielick/faktory-client/master.svg)](https://travis-ci.org/jbielick/faktory-client)
[![Coveralls github branch](https://img.shields.io/coveralls/github/jbielick/faktory-client/master.svg)](https://coveralls.io/github/jbielick/faktory-client)
[![David](https://img.shields.io/david/jbielick/faktory-client.svg)](#)
[![node](https://img.shields.io/node/v/faktory-client.svg)]()

A node.js client for the Faktory job server

This repository provides a node.js client for [Faktory](https://github.com/contribsys/faktory). The client allows you to push jobs, fetch jobs, and otherwise communicate with the Faktory server.

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

- [ ] Heartbeat
- [ ] Connection interrupt graceful shutdown
- [ ] Reconnects
- [ ] TLS

## Development

Use docker-compose for easy setup of the faktory server:

`docker-compose run server` to start the faktory server container.

Use `DEBUG=faktory*` to see debug lines.

## Tests

The test suite will start a faktory server docker container and bind to
port 7419 on localhost.

`npm test` will run the tests concurrently with ava.

## Author

Josh Bielick, @jbielick
