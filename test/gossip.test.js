'use strict'

var expect = require('chai').expect
var R = require('ramda')

var sortObjArray = function(a, b) {
  return a.id > b.id
}

describe('Gossip', function() {

  describe('GossipRPS', function() {
    var GossipRPS = require('../src/extensions/gossipRPS.js')
    var gossip
    var view

    beforeEach(function() {
      gossip = new GossipRPS(-1, {})
      view = [
        {id: 'a', age: 1},
        {id: 'b', age: 2},
        {id: 'c', age: 3},
        {id: 'd', age: 4},
        {id: 'e', age: 5},
        {id: 'f', age: 6},
        {id: 'g', age: 7}]
    })

    describe('#genBuffer', function() {
      var distantId = 'd'

      it('should return a view without remote\'s descriptor', function() {
        var buffer = gossip.genBuffer('active', distantId, view)
        var result = buffer.reduce(
          ((acc, elemt) => acc && elemt.id !== distantId),
          true)
        expect(result).to.be.true
      })

      it('passive, view = ø => sentBuffer = ø', function() {
        expect(gossip.genBuffer('passive', distantId, [])).to.be.deep.eq([])
      })

      it('active, view = ø => sentBuffer = [selfDescirptor]', function() {
        expect(gossip.genBuffer('active', distantId, []))
          .to.be.deep.eq([{id: gossip.id, age: 0}])
      })

      describe('view < C/2', function() {
        it('passive: should return sentBuffer = view', function() {
          gossip.options.C = 50
          distantId = 'aa'
          var result = gossip.genBuffer('passive', distantId, view)
          expect(result).to.be.deep.eq(view)
        })

        it('active: should return view + selfDescriptor', function() {
          gossip.options.C = 50
          distantId = 'aa'
          var result = gossip.genBuffer('active', distantId, view)
          view.push({id: gossip.id, age: 0})
          expect(result).to.be.deep.eq(view)
        })
      })

      it('view > C => sentBuffer = C/2', function() {
        gossip.options.C = 10
        expect(gossip.genBuffer('active', distantId, view).length)
          .to.be.eq(gossip.options.C / 2)
      })
    })

    describe('#increaseAge', function() {
      it('should increase each age by one', function() {
        var check = view.reduce(((acc, elt) => acc + elt.age), 0)
        var result = gossip.increaseAge(view)
              .reduce(((acc, elt) => acc + elt.age), 0)
        expect(result).to.be.equal(check + view.length)
      })
    })

    describe('#getOldestNodeDescriptor', function() {
      it('should return the oldest node', function() {
        var oldest = gossip.getOldestNodeDescriptor(view)
        expect(oldest.id).to.be.equal('g')
      })
    })

    describe('#mergeView', function() {

      describe('it should keep the youngest node descriptors', function() {
        it('should return view', function() {
          var view = [{id: 'a', age: 1}, {id: 'b', age: 0}]
          expect(gossip.mergeView([{id: 'a', age: 3}], [], view)).to.be.deep.eq(view)
        })

        it('should return the view (bis)', function() {
          view = [{id: 'a', age: 3}, {id: 'b', age: 0}]
          expect(gossip.mergeView([{id: 'a', age: 3}], [], view)).to.be.deep.eq(view)
        })

        it('should return the new descriptor', function() {
          view = [{id: 'a', age: 5}, {id: 'b', age: 0}]
          var result = gossip.mergeView([{id: 'a', age: 3}], [], view).sort(sortObjArray)
          console.log(result)
          expect(result)
            .to.be.deep.eq([{id: 'a', age: 3}, {id: 'b', age: 0}])
        })
      })

      it('remoteBuffer = ø, sentBuffer = ø, view = ø => ø', function() {
        expect(gossip.mergeView([], [], [])).to.be.deep.eq([])
      })

      it('remoteBuffer = C/2, sentBuffer = ø, view = ø => remoteBuffer', function() {
        var remoteBuffer = view
        expect(gossip.mergeView(remoteBuffer, [], [])).to.be.deep.eq(remoteBuffer)
      })

      it('remoteBuffer ≤ C/2, sentBuffer = ø, view < C/2 => union(remoteBuffer view)', function() {
        var remoteBuffer = [{id: 'aa', age: 3}]
        var result = gossip.mergeView(remoteBuffer, [], view)
              .sort(sortObjArray)
        var union = R.union(remoteBuffer, view).sort(sortObjArray)
        expect(result).to.be.deep.eq(union)
      })

      it('remoteBuffer = C/2, sentBuffer = ø, view = C, H = 0 => random view')
      it('remoteBuffer = C/2, sentBuffer = ø, view = C, H = C/2 => remoteB >- view')

      it('remoteBuffer = ø, sentBuffer ≤ C/2, view < C => view', function() {
        expect(gossip.mergeView([], view.slice(0, gossip.options.C / 2), view))
          .to.be.deep.eq(view)
      })

      it('remoteBuffer ≤ C/2, sentBuffer ≤ C/2, view ≤ C/2, H = *, S = *')
    })

    describe('#selectRemotePeer', function() {
      it('should return the oldest node when method=\'oldest\'', function() {
        expect(gossip.selectRemotePeer('oldest', view))
          .to.be.equal(gossip.getOldestNodeDescriptor(view).id)
      })

      it('should return a random id (P=1/7^1000 to be false negative)', function() {
        var s = new Set()
        for(var i = 0; i < 1000; ++i) {
          s.add(gossip.selectRemotePeer('random', view))
        }
        expect(s.size).to.be.eq(7)
      })
    })
  })
})
