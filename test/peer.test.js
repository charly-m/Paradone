/* global sinon expect */
'use strict'

var Peer = require('../src/peer.js')
var MessageEmitter = require('../src/messageEmitter.js')
var options = {
  signal: { url: 'ws://127.0.0.1'}
}
window.paradone = window.paradone || {}
window.paradone.Peer = Peer

describe('Peer', function() {
  this.timeout(5000)

  describe('@constructor', function() {
    it('should be a EventEmitter', function() {
      var peer = new Peer(options)
      expect(peer instanceof MessageEmitter).to.be.true
    })
  })

  /*
   * It should go like this
   * - A send request:peer
   * - B respond with offer
   * - A respond with answer
   * - A and B receive ICE
   * - Datachannel is open => onconnected event is emitted
   * - Disconnection of a peer
   */
  describe('1-to-1 connection protocol', function() {
    var peerA = new Peer(options)
    var peerB = new Peer(options)
    var messages = {}

    describe('A should broadcast a peer request', function() {
      sinon.stub(peerA, 'send', function(message) {
        messages.requestFromA = message
      })
      peerA.requestPeer()

      var testParams = [
        ['should be from A', 'from', peerA.id],
        ['should be for everyone', 'to', '-1'],
        ['should be a request', 'type', 'request-peer'],
        ['should not been forwarded', 'forwardBy', []],
        ['should have default ttl', 'ttl', 3]
      ]

      testParams.forEach(function(param) {
        it(param[0], function() {
          sinon.assert.calledWith(
            peerA.send,
            sinon.match.has(param[1], param[2]))
        })
      })
    })

    describe('B should return an offer to A', function() {
      before(function(done) {
        // Wait for B to receive the event
        sinon.stub(peerB, 'send', function(message) {
          if('offer' === message.type) {
            messages.offerFromB = message
            done()
          } else if('icecandidate' === message.type) {
            messages.iceFromB = message
          }
        })
        // Send the previous request to B
        peerB.emit(messages.requestFromA)
      })

      var testParams = [
        ['should be from B', 'from', peerB.id],
        ['should be for A', 'to', peerA.id],
        ['should be an offer', 'type', 'offer']
      ]

      testParams.forEach(function(param) {
        it(param[0], function() {
          sinon.assert.calledWith(
            peerB.send,
            sinon.match.has(param[1], param[2]))
        })
      })
    })

    describe('A should return an answer to B', function() {
      before(function(done) {
        peerA.send.restore()
        sinon.stub(peerA, 'send', function(message) {
          if('answer' === message.type) {
            messages.answerFromA = message
            done()
          } else if('icecandidate' === message.type) {
            messages.iceFromA = message
          }
        })
        // Send the offer to A
        peerA.emit(messages.offerFromB)
      })

      var testParams = [
        ['should be from A', 'from', peerA.id],
        ['should be for B', 'to', peerB.id],
        ['should be an answer', 'type', 'answer']
      ]

      testParams.forEach(function(param) {
        it(param[0], function() {
          sinon.assert.calledWith(
            peerA.send,
            sinon.match.has(param[1], param[2]))
        })
      })
    })

    /*
     * Check if the ICECANDIDATE event has been fired. For now we get
     * the value from global messages variable
     */
    describe('A should have received ICECandidates for B', function() {

      it('should have sent icecandidate type message', function() {
        var iceA = messages.iceFromA
        expect(iceA).not.to.be.null
        expect(iceA).not.to.be.an('undefined')
        expect(iceA.type).to.be.equal('icecandidate')
      })

      it('should be from A', function() {
        expect(messages.iceFromA.from).to.be.equal(peerA.id)
      })

      it('should be for B', function() {
        expect(messages.iceFromA.to).to.be.equal(peerB.id)
      })

      it('should be a RTCIceCandidate object', function() {
        var data = messages.iceFromA.data
        expect(data).to.be.an.instanceof(window.RTCIceCandidate)
      })
    })

    describe('B should have received ICECandidates for A', function() {
      it('should have sent icecandidate type message', function() {
        var iceB = messages.iceFromB
        expect(iceB).not.to.be.null
        expect(iceB).not.to.be.an('undefined')
        expect(iceB.type).to.be.equal('icecandidate')
      })

      it('should be from B', function() {
        expect(messages.iceFromB.from).to.be.equal(peerB.id)
      })

      it('should be for A', function() {
        expect(messages.iceFromB.to).to.be.equal(peerA.id)
      })

      it('should be a RTCIceCandidate object', function() {
        var data = messages.iceFromB.data
        expect(data).to.be.an.instanceof(window.RTCIceCandidate)
      })
    })

    describe('Peers should be connected', function() {
      it('should fire a `onconnected` event', function(done) {
        // We test that B correctly receives the remote ondatachannel event
        peerB.on('connected', function() {
          expect(peerB.connections.get(peerA.id).status).to.be.equal('open')
          done()
        })
        // Finish the protocol
        // Send answer to B
        peerB.emit(messages.answerFromA)
        // Set IceC for both peers
        peerA.emit(messages.iceFromB)
        peerB.emit(messages.iceFromA)
      })
    })

    describe('Disconnect event on communication end', function() {
      it('should fire a `ondisctonnected` event', function(done) {
        peerB.on('disconnected', function() {
          done()
        })
        peerA.connections.get(peerB.id).close()
      })
    })
  })

  describe('Mesh structure', function() {

    describe('A sends messages on the mesh', function() {

      var peers = {}

      before(function(done) {
        var peerA = peers.A = new Peer(options)
        var peerB = peers.B = new Peer(options)
        var peerC = peers.C = new Peer(options)

        peerA.id = 'A'
        peerB.id = 'B'
        peerC.id = 'C'
        peerA.connections.delete('signal')
        peerB.connections.delete('signal')
        peerC.connections.delete('signal')

        var requestFromB = {
          type: 'request-peer',
          from: peerB.id,
          to: -1,
          ttl: 3,
          forwardBy: []
        }

        sinon.stub(peerA, 'send', function(message) {
          console.debug('Send A')
          peers[message.to].emit(message)
        })
        sinon.stub(peerB, 'send', function(message) {
          peers[message.to].emit(message)
        })
        sinon.stub(peerC, 'send', function(message) {
          console.debug('Send C')
          peers[message.to].emit(message)
        })

        // Send peer request from B to A and C
        peerA.emit(requestFromB)
        peerC.emit(requestFromB)

        // Wait for connection to be established
        peerB.on('connected', function() {
          console.log('Connected')
          done()
        })
      })

      it('B receive the test request (1 hop)', function(done) {
        peers.A.send.restore()
        peers.B.send.restore()
        peers.C.send.restore()

        peers.B.on('test', function() {
          done()
        })
        peers.A.send({
          type: 'test',
          from: peers.A.id,
          to: peers.B.id,
          data: 'AtoB',
          ttl: 3,
          forwardBy: []
        })
      })

      it('C receive the peer request (2 hops)', function(done) {
        // Only request-peer, icecandidate, offer and answer are forwarded
        peers.C.removeAllListeners('request-peer')
        peers.C.on('request-peer', function(message) {
          expect(message.forwardBy.length).to.be.equal(1)
          expect(message.ttl).to.be.equal(2)
          done()
        })
        peers.A.send({
          type: 'request-peer',
          from: peers.A.id,
          to: peers.C.id,
          data: 'AtoC',
          ttl: 3,
          forwardBy: []
        })
      })

      it('A stores message, requests connection and transmit message', function(done) {
        peers.C.on('queuetest', function() {
          expect(peers.A.queue).to.be.empty
          done()
        })
        expect(peers.A.queue).to.be.empty
        peers.A.send({
          type: 'queuetest',
          from: peers.A.id,
          to: peers.C.id,
          data: 'AtoC2',
          ttl: 3,
          forwardBy: []
        })
        expect(peers.A.queue).to.have.length(1)
        expect(peers.A.queue[0].message.type).to.be.eq('queuetest')
      })

    })

    describe('One node connecting requesting multiple peers', function() {

      var peers = {}
      var peerA = peers.A = new Peer(options)
      var peerB = peers.B = new Peer(options)
      var peerC = peers.C = new Peer(options)

      // Connect A to B and send request from C to both
      before(function(done) {
        peerA.id = 'A'
        peerB.id = 'B'
        peerC.id = 'C'
        peerA.connections.delete('signal')
        peerB.connections.delete('signal')
        peerC.connections.delete('signal')

        var requestFromB = {
          type: 'request-peer',
          from: peerB.id,
          to: -1,
          ttl: 3,
          forwardBy: []
        }
        var requestFromC = {
          type: 'request-peer',
          from: peerC.id,
          to: -1,
          ttl: 3,
          forwardBy: []
        }

        sinon.stub(peerA, 'send', function(message) {
          peers[message.to].emit(message)
        })
        sinon.stub(peerB, 'send', function(message) {
          peers[message.to].emit(message)
        })
        sinon.stub(peerC, 'send', function(message) {
          peers[message.to].emit(message)
        })

        peerB.on('connected', function self() {
          // Wait for connection with A to be established
          peerA.emit(requestFromC)
          console.log('onconnected B')
          peerB.emit(requestFromC)
          peerB.removeListener('connected', self)
        })

        peerC.on('connected', function() {
          try {
            peerA.send.restore()
            peerB.send.restore()
            peerC.send.restore()
          } catch(e) {
            // DEBUG Might be wrong
            // TODO
          }
          done()
        })

        // Connect A and B
        peerA.emit(requestFromB)
      })

      describe('C should be connected', function() {
        it('should have an open connection', function() {
          expect(peers.C.connections.get('B').status).to.be.equal('open')
        })
      })
    })
  })

  describe('Timeout messages', function() {
    var peer = new Peer(options)
    peer.id = '1'
    peer.connections.delete('signal')

    it('should store non-connection related messages', function() {
      peer.send({
        type: 'offer',
        from: peer.id,
        to: 'a',
        data: '',
        ttl: 3,
        forwardBy: []
      })
      peer.send({
        type: 'request-peer',
        from: peer.id,
        to: 'a',
        data: '',
        ttl: 3,
        forwardBy: []
      })
      peer.send({
        type: 'answer',
        from: peer.id,
        to: 'a',
        data: '',
        ttl: 3,
        forwardBy: []
      })
      peer.send({
        type: 'icecandidate',
        from: peer.id,
        to: 'a',
        data: '',
        ttl: 3,
        forwardBy: []
      })
      expect(peer.queue).to.empty
      peer.send({
        type: 'test',
        from: peer.id,
        to: 'a',
        data: ''
      })
      expect(peer.queue).to.have.length(1)
      peer.send({
        type: 'test2',
        from: peer.id,
        to: 'a',
        data: ''
      })
      expect(peer.queue).to.have.length(2)
    })

    it('should drop messages after timeout and executes the callbacks', function(done) {
      var clock = sinon.useFakeTimers()
      peer = new Peer(options)
      peer.id = '1'
      peer.connections.delete('signal')

      peer.send({
        type: 'queuetest',
        from: peer.id,
        to: peer.id,
        data: '',
        timeout: 1500
      }, done)

      expect(peer.queue).to.have.length(1)
      clock.tick(1000)
      expect(peer.queue).to.have.length(1)
      clock.tick(1000)
      expect(peer.queue).to.have.length(0)

      clock.restore()
    })
  })

})
