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
 * @flow
 */
'use strict'

/**
 * @typedef View
 * @desc A list of NodeDescriptors
 * @type {Array.<NodeDescriptor>}
 */

/**
 * @typedef NodeDescriptor
 * @desc Object containing information about a peer. This information should be
 *       enough to allow any peer possessing the descriptor to establish a
 *       connection of the described peer.
 * @type {Object}
 * @property {string} id - Id of the remote peer
 * @property {number} age - For how long the node has been in the view
 */

/**
 * Implementation of a gossip protocol for unstructured P2P network
 *
 * @mixin Gossip
 * @param {Object} parameters
 * @property {View} view - List of known peers
 * @property {Worker} worker - Web worker used to process messages behind the
 *           scenes
 * @extends Peer
 */
export default function Gossip(parameters) {
  this.worker = new Worker('./gossipWorker.js')
  this.worker.addEventListener('message', evt => this.send(evt.data))

  // this.worker.postMessage doesn't seem to be a valid listener, we need to
  // wrap it
  this.on('first-view', msg => this.worker.postMessage(msg))
  this.on('gossip:request-exchange', msg => this.worker.postMessage(msg))
  this.on('gossip:answer-request', msg => this.worker.postMessage(msg))
  this.on('gossip:descriptor-update', msg => this.worker.postMessage(msg))

  this.on('gossip:view-update', msg => {
    console.debug('Gossip: New view', msg.data)
    this.view = msg.data
  })

  // Initialization of the Web Worker
  this.worker.postMessage({type: 'gossip:init', data: parameters})
}
