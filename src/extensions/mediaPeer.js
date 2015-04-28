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

import Media from './media.js'
import { getURL, getRemoteFile, timeLog } from '../util.js'
import { filter, forEach, pipe } from 'ramda'
export default MediaPeer

/**
 * Set a new media we need to leech
 *
 * @function addMedia
 * @memberof MediaPeer
 * @memberof paradone.MediaPeer
 * @param {string} sourceURL - URL for the file
 * @param {string} metafile - URL for the metadata
 * @param {HTMLMediaElement} tag - Element in which the media should be played
 * @param {boolean} autoload - Whether or not the file should be played when
 *        the download is over
 */
var addMedia = function(sourceURL, metaURL, tag, autoload) {
  // Track the file
  console.debug('add media')
  var media = new Media(sourceURL, metaURL, tag, autoload)
  this.dispatchMessage({
    from: this.id,
    to: this.id,
    type: 'request-metadata',
    data: metaURL,
    url: sourceURL
  })

  this.files.set(sourceURL, media)

  // TODO Else could be a new tag for the media
}

/**
 * Return the next part a peer should ask based on the metadata of a media and
 * the already downloaded parts.
 *
 * @function askForNextParts
 * @memberof MediaPeer
 * @param {Media} media - Media file from which the peer possesses at-least the
 *        meta-data
 * @param {number} nbParts - number of parts to be returned
 */
var askForNextParts = function(media, nbParts) {
  var downloadFromServer = (peer, partNumber) => () => {
    timeLog('Server download of part', partNumber)
    let partRange = media.getRangeOfPart(partNumber)
    getRemoteFile(media.url, 'arraybuffer', partRange)
      .then(part => peer.dispatchMessage({
        from: this.id,
        to: this.id,
        type: 'part',
        data: part,
        url: media.url,
        number: partNumber
      }))
  }

  var choices = media.nextPartsToDownload(nbParts)
  choices.forEach(choice => {
    var [remote, partNumber] = choice

    if(remote === 'source') { // Download from server
      remote = -1
      /*getRemoteFile(media.url, 'arraybuffer', partRange)
        .then(postPart(this)(partNumber))*/
    }
    // else { // Download from p2p network
    timeLog('Asking for part', partNumber, 'to peer', remote)

    this.send({
      type: 'request-part',
      from: this.id,
      to: remote,
      url: media.url,
      ttl: this.ttl,
      forwardBy: [],
      number: partNumber,
      timeout: 3000
    }, downloadFromServer(this, partNumber))
    // }

    media.parts[partNumber].status = 'pending'
  })
}

/**
 * Handle when the channel is openned
 *
 * @param {string} remotePeer - Id of the remote peer we just connected to
 */
var onconnected = function(message) {}

/**
 */
var onmetadata = function(message) {
  console.debug('onmetadata')
  var meta = message.data
  var url = message.url
  var media = this.files.get(url)
  media.setMetadata(meta)

  // We can start downloading the head
  this.dispatchMessage({
    from: this.id,
    to: this.id,
    type: 'request-head',
    data: '',
    url: url
  })
}

/**
 */
var onrequestmetadata = function(message) {
  console.debug('onrequestmetadata')
  var metaURL = message.data
  getRemoteFile(metaURL, 'json').then(meta => {
    meta.url = metaURL
    this.dispatchMessage({
      from: this.id,
      to: this.id,
      type: 'metadata',
      data: meta,
      url: message.url
    })
  })
}

var onhead = function(message) {
  console.debug('onhead')
  var head = message.data
  var url = message.url
  var media = this.files.get(url)

  media.setHead(head)

  // We have the head, we can request random parts now
  askForNextParts.call(this, media, MediaPeer.concurrentParts)
}

var onrequesthead = function(message) {
  console.debug('onrequesthead')

  var url = message.url
  var media = this.files.get(url)

  getRemoteFile(url, 'arraybuffer', media.getRangeOfHead())
    .then(head => this.dispatchMessage({
      from: this.id,
      to: this.id,
      type: 'head',
      url: url,
      data: head
    }))
}
/**
 * Message containing a part of the desired media
 *
 * @param {Message} message - A part type message containing a chunk of media
 */
var onpart = function(message) {
  console.assert(this.files.has(message.url),
    'Message type:part received for an undesired file')

  var media = this.files.get(message.url)
  media.append(message.number, message.data)
  // TODO media.storeChunk(message.number, new Uint8Array(message.data))

  // Ask for a new part
  this.askForNextParts(media, 1)
}

/**
 * The remote peer requests some file part
 * We need to check if we have them and then we can send them
 *
 * @param {Message} message - A request for a chunk of a media
 */
var onrequestpart = function(message) {
  var sendChunks = function(chunk) {
    // TODO Gotta check if node has the file or not
    // We have to change the Uint8Array in a Array
    // Should take less space in the message and be easier to parse
    var data = []
    for(var i = 0; i < chunk.length; ++i) {
      data.push(chunk[i])
    }

    this.respondTo(
      message, {
        type: 'part',
        number: message.number,
        data: data,
        url: message.url
      })
  }.bind(this)

  this.files.get(message.url)
    .getChunk(message.number)
    .then(sendChunks)
}

/**
 * Parse the document and get all videos elements
 */
var parseDocument = function() {
  // Check the video tag (not a real array)
  var videos = document.getElementsByTagName('video')
  var load = pipe(
    filter(video => video.hasAttribute('data-meta')),
    forEach(video => {
      var source = video.src
      var metaURL = getURL(video.getAttribute('data-meta'))
      // DEBUG Prevent firefox from downloading the video directly
      video.removeAttribute('src')
      this.addMedia(source, metaURL, video, true)
    })
  )
  load(videos)
}

var updateGossipDescriptor = function(message) {
  var media = this.files.get(message.url)
  // Get already downloaded parts
  var parts = media.parts
    .filter(p => p.status === 'available' || p.status === 'added')
    .map(p => p.partNumber)
  // Add received part
  parts.push(message.number)

  this.dispatchMessage({
    from: this.id,
    to: this.id,
    type: 'gossip:descriptor-update',
    data: {
      path: ['files', message.url],
      value: parts
    }
  })
}

/**
 * A media peer implements the functions used to share and retrieve media files
 * on the mesh
 *
 * @mixin MediaPeer
 * @param {Object} parameters
 * @param {number} downloadTimeout - Timeout after which the media should be
 *        downloaded from the server
 * @param {number} concurrentParts - Number of parts that should be downloaded
 *        simultaneously by the peer
 * @property {Media} files - Map of files indexed by url
 */
function MediaPeer(parameters) {
  // Start the script on each connection
  this.on('connected', onconnected)

  this.on('request-metadata', onrequestmetadata)
  this.on('metadata', onmetadata)
  this.on('request-head', onrequesthead)
  this.on('head', onhead)
  this.on('request-part', onrequestpart)
  this.on('part', onpart)
  this.on('part', updateGossipDescriptor)

  this.files = new Map()
  this.askForNextParts = askForNextParts
  this.addMedia = addMedia
  this.parseDocument = parseDocument

  // TODO (Storage) Check out if there are any local files we can seed
  // MediaStore.forEachStoredMedia(media => this.files.set(media.url, media))

  if(parameters.hasOwnProperty('downloadTimeout')) {
    Media.downloadTimeout = parameters.downloadTimeout
  }

  if(parameters.hasOwnProperty('concurrentParts')) {
    MediaPeer.concurrentParts = parameters.concurrentParts
  }

  if(parameters.hasOwnProperty('autoload') && parameters.autoload) {
    this.parseDocument()
  }
}

/**
 * How many parts the peer should download in parallel
 * @name MediaPeer.concurrentParts
 * @type {number}
 */
MediaPeer.concurrentParts = 3
