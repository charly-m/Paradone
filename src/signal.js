/* @flow weak */
'use strict'

/**
 * Client-side implementation of Signal working with the ParadoneServer.
 *
 */
function Signal(peer, options) {
  // url -> 'ws://127.0.0.1:8081'
  var url = options.url || 'ws://127.0.0.1:8081'
  var socket = new WebSocket(url)

  socket.addEventListener('open', onconnect.bind(this))
  socket.addEventListener('close', onclose.bind(this))
  socket.addEventListener('error', onerror.bind(this))
  socket.addEventListener('message', onmessage.bind(this, peer))

  this.socket = socket
}

Signal.prototype.send = function(message) {
  message.ttl = 0
  message = JSON.stringify(message)
  this.socket.send(message)
}

var onerror = function(error) {
  console.error(error)
}

var onmessage = function(peer, messageEvent) {
  var message = JSON.parse(messageEvent.data)
  peer.emit(message)
}

var onconnect = function() {
  this.status = 'open'
}

var onclose = function() {
  this.status = 'close'
}

module.exports = Signal
