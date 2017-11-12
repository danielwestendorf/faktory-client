0.4.0 | 2017-11-12
---

 * Updates for faktory protocol verison 2 compatibility

### Breaking

 * Must provide `wid` in construction if the client is going to heartbeat, otherwise it will error.
 * .beat() now returns a string with either 'OK' or the `state` value 'quiet'|'terminate'
