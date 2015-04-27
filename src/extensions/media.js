/*
 * Copyright 2015 Paradone
 *
 * This file is part of Paradone <https://paradone.github.io>
 *
 * Paradone is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * Paradone is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public
 * License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Paradone.  If not, see <http://www.gnu.org/licenses/>.
 *
 * @flow weak
 */
'use strict'

import { shuffleArray, error as errorHandler } from '../util.js'
export default Media

var MediaSource = window.MediaSource || window.WebKitMediaSource

/**
 * Download, store, load and play a media file with local storage and
 * MediaSource
 *
 * @class Media
 * @param {string} sourceURL - Source URL of the media
 * @param {string} metaURL - URL of the metadata
 * @param {HTMLMediaElement} sourceTag - The tag where the media should be
 *        displayed
 * @param {boolean} [autoload=false] - Automatic play of the media
 *
 * @property {string} url - Source URL of the media. It's used to identify the
 *           media on the mesh
 * @property {Object} metadata - Information about the media file
 * @property {HTMLMediaElement} sourceTag - HTML element where hte media will
 *           be played
 * @property {Array.<Array.<number>>} remotes - Media's meta-data
 * @property {boolean} complete - Indicates if the file is complete or if the
 *           peer should ask from the missing parts
 * @property {Array.<number>} pendingParts - Media parts requested but not yet
 *           received
 * @property {boolean} autoload - Automatic play of the media
 * @property {Array.<Part>} parts - List of
 */
function Media(sourceURL, metaURL, sourceTag, autoload = false) {
  this.url = sourceURL
  this.sourceTag = sourceTag
  this.remotes = {}
  this.complete = false
  this.pendingParts = []
  this.autoload = autoload
  this.parts = []

  // DEBUG
  window.media = this
}

/**
 * Timeout indicating how long the peer should wait for an answer from remote
 * peers before it downloads the file from the server. This value can be set
 * trough the parameter of the "media" extension. The value is in ms and the
 * default is 5000 (5 seconds)
 *
 * @name Media.downloadTimeout
 * @type {number}
 */
Media.downloadTimeout = 5000

/**
 * Action done when the file is complete. Here we start playing the media if
 * autoload is activated
 *
 * @function Media#isComplete
 */
Media.prototype.isComplete = function() {
  if(!this.complete) {
    this.complete = this.parts
      .reduce((acc, p) => acc && p.status === 'added', true)
  }
  return this.complete
}

/**
 * Select next missing parts. Ids of requested parts are stored until the part
 * is downloaded.
 *
 * @param {number} howMany - How many missing parts should be returned
 * @return {Array.<[string, number]>} Array of tuples containing [remote id,
 *         part number]
 * @function Media#nextPartsToDownload
 */
Media.prototype.nextPartsToDownload = function(howMany) {
  /**
   * Select one of the peers possessing a specific part of the media and return
   * its id
   *
   * @param {Remotes} remotes - Which chunk is available on which remote peer
   * @param {number} partNumber - The number of the chunk needed next
   * @return {string} Id of the remote peer or 'source' if the download should
   *         be made from the server
   */
  var selectPeer = function(remotes, partNumber) {
    // Get all random peers
    if(typeof remotes !== 'undefined') {
      var remoteIds = shuffleArray(Object.keys(remotes))
      // Take the first peer which has the desired part
      for(var j = 0; j < remoteIds.length; ++j) {
        var id = remoteIds[j]
        if(remotes[id].indexOf(partNumber) !== -1) {
          console.debug('select peer', id, 'for part', partNumber)
          return [id, partNumber]
        }
      }
    }
    console.debug('select source for part', partNumber)
    return ['source', partNumber]
  }

  return this.parts
    .filter(p => p.status === 'needed')
    .map(p => p.partNumber)
    .slice(0, howMany) // Keep the desired number of parts
    .map(pNbr => selectPeer(this.remotes, pNbr)) // Get a peer for each part
}

/**
 * Check if a particular part is available on peer side
 *
 * @param {number} partNumber
 * @return {boolean} True if the peer has the part
 * @function Media#peerHasPart
 */
Media.prototype.peerHasPart = function(partNumber) {
  var part = this.parts[partNumber]
  return part.status === 'available' || part.status === 'added'
}

/**
 * Check if a remote peer has a particular part of a media. It is based on the
 * meta-data received through info-request and is not 100% accurate
 *
 * @param {string} remotePeer - Which remote peer should be checked
 * @param {number} partNumber - Which part should be checked
 * @return {boolean} True if the remote peer seems to possess the part
 * @function Media#remoteHasPart
 */
Media.prototype.remoteHasPart = function(remotePeer, partNumber) {
  var remote = this.remotes[remotePeer]
  return typeof remote !== 'undefined' && remote.indexOf(partNumber) !== -1
}

/**
 * Define information through extracting it from a message. If the info is not
 * defined yet we create it from the info message. We extract the available
 * parts on the remote peer and store it.  Finally we check if the remote peer
 * has some new information about availability of the file on the other nodes.
 *
 * @param {Info} info - media's meta-data
 * @param {string} from - id of the remote peer
 * @return {Promise} A promise to store the info
 * @function Media#buildInfoFromRemote
 * @deprecated
 */
Media.prototype.buildInfoFromRemote = function(info, from) {
  // Add local information
  if(!this.info.hasOwnProperty('url')) {
    this.info.url = info.url
    this.info.parts = info.parts
    this.info.size = info.size
    this.info.available = []
    this.info.remote = info.remote
  }

  // Save fresh information about remote peer
  this.info.remote[from] = info.available

  // Update data about other peers
  Object.keys(info.remote).forEach(function(remotePeer) {
    var availParts = info.remote[remotePeer]

    if(this.info.remote.hasOwnProperty(remotePeer)) {
      // The node already had some info about the peer. We add the
      // new available parts
      for(var i = 0; i < availParts.length; ++i) {
        var partNumber = availParts[i]
        if(this.info.remote[from].indexOf(partNumber) === -1) {
          this.info.remote[from].push(partNumber)
        }
      }
    } else {
      this.info.remote[from] = availParts
    }
  }, this)

  // Store everything
  return this.storeInfo(info)
}

/**
 * @param {Metadata} meta
 */
Media.prototype.setMetadata = function(meta) {
  this.metadata = meta
  for(let i = 0; i < meta.clusters.length; ++i) {
    this.parts[i] = {
      partNumber: i,
      status: 'needed'
    }
  }
}

/**
 * @param {number} partNumber
 */
Media.prototype.getRangeOfPart = function(partNumber) {
  var meta = this.metadata
  var lastPart = meta.clusters.length - 1
  var range = meta.clusters[partNumber].offset + '-'
  if(partNumber === lastPart) {
    range += meta.size
  } else {
    range += meta.clusters[partNumber + 1].offset - 1
  }
}

/**
 */
Media.prototype.getRangeOfHead = function() {
  return '0-' + String(this.metadata.clusters[0].offset - 1)
}

var appendQueuedParts = function() {
  var nextPart
  for(let part of this.parts) {
    if(part.status === 'available') {
      nextPart = part
    }
  }

  if(typeof nextPart === 'undefined') {
    this.sourceBuffer.removeEventListener('updateend', appendQueuedParts)

    if(this.isComplete()) {
      this.mediaSource.endOfStream()
    }
  } else if(!this.sourceBuffer.updating) {
    // Write current chunk
    this.sourceBuffer.appendBuffer(new Uint8Array(nextPart))
    nextPart.status = 'added'
  }
}

/**
 * @param {ArrayBuffer} head
 */
Media.prototype.setHead = function(head) {

  this.head = head

  var mediaSource = new MediaSource()
  var codec = 'video/webm; codecs="vorbis, vp8"' // TODO Check the codecs
  var video = this.sourceTag
  // When mediaSource is ready we append the parts in a new source buffer.
  mediaSource.addEventListener('sourceopen', () => {
    // Start recursion
    console.debug('2. mediasource: Source open after head was received')
    var sourceBuffer = mediaSource.addSourceBuffer(codec)
    sourceBuffer.addEventListener('updateend', appendQueuedParts.bind(this))
    sourceBuffer.appendBuffer(head)
    this.sourceBuffer = sourceBuffer
  }, false)

  console.debug('1. Save the source and buffer', mediaSource.readyState)
  this.mediaSource = mediaSource
  // Triggers the "sourceopen" event of the MediaSource object
  video.src = window.URL.createObjectURL(mediaSource)
}

/**
 * @param {number} partNumber - Id for the part
 * @param {ArrayBuffer} part - A part of the media
 */
Media.prototype.append = function(partNumber, part) {
  this.parts[partNumber] = {
    partNumber: partNumber,
    part: part,
    status: 'available'
  }

  if(this.hasOwnProperty('sourceBuffer') &&
     this.mediaSource.readyState === 'open' &&
     !this.sourceBuffer.updating) {
    this.sourceBuffer.addEventListener(
      'updateend',
      appendQueuedParts.bind(this))
    this.sourceBuffer.appendBuffer(new Uint8Array(part))
    this.parts[partNumber].status = 'added'
  }
}
