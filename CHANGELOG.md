0.4.3 | 2017-11-12
---

 * Bugfix: in the rare case a response is dropped from the server, the code was using a variable that was not defined to log the dropped message.

0.4.2 | 2017-11-12
---

 * Bugfix: server now sends NULL for fetch requests when queues are empty. The code attempted to use string methods on this, expecting that it was a buffer/string.

0.4.1 | 2017-11-12
---

 * Test updates

0.4.0 | 2017-11-12
---

 * Updates for faktory protocol verison 2 compatibility https://github.com/contribsys/faktory/pull/72

### Breaking

 * Must provide `wid` in construction if the client is going to heartbeat, otherwise it will error.
 * .beat() now returns a string with either 'OK' or the `state` value 'quiet'|'terminate'
