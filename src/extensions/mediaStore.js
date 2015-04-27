'use strict'

import localforage from 'localforage'
import { shuffleArray, error as errorHandler, getRemoteFile } from './util.js'

localforage.config({
  name: 'HEA',// DBName
  storeName: 'VID', // datastore or table
  version: 1.0,// Default
  description: 'A test table'
})

// DEBUG Remove all previous data to enforce peer communication
localforage.clear()

/**
 * Get and store the file from the distant server to the local storage
 *
 * @function Media#storeDistantFile
 */
export function storeDistantFile() {
  return this.getRemoteFile(this.url, 'arraybuffer')
    .then(this.storeFileBuffer.bind(this, Media.chunkSize))
    .catch(function(e) {
      console.error('The file could not be stored', e)
    })
}

/**
 * Apply function on every locally stored medias
 *
 * @function Media.forEachStoredMedia
 * @param {function(Media)} callback - Callback applied to each file
 */
export function forEachStoredMedia(callback) {
  // TODO Rename function
  localforage.keys(function(err, keys) {
    if(err) {
      throw err
    }

    // No errors: we get every info parts
    keys.filter(key => /-info$/.test(key))
      .forEach(key => localforage.getItem(key, function(error, info) {
        if(error) {
          throw error
        } else if(Array.isArray(info.available) &&
                  info.parts === info.available.length) {
          // If the file is complete we apply the function
          // TODO Do not create a Media file
          var file = Media.createMediaFromInfo(info, false)
          callback(file)
        }
      }))
  })
}

/**
 * Store media as splitted elements for easier transmission later
 *
 * @param {number} chunkSize - Max size for a part. Depends on DataChannel's
 *        limit
 * @param {ArrayBuffer} fileBuffer - Buffer representing the file
 * @return {Promise} a bunch of Promises
 * @function Media#storeFileBuffer
 */
export function storeFileBuffer(chunkSize, fileBuffer) {
  var parts = Math.ceil(fileBuffer.byteLength / chunkSize)
  var promises = []

  // Save info for later
  // WARNING This needs to be processed before all parts are stored to
  //         activate the SourceMedia.
  promises.push(this.buildInfoFromLocal(fileBuffer.byteLength, parts))

  // Save the parts
  for(var i = 0; i < parts; ++i) {
    // TODO [Storage] Save as Uint8 Array?
    var aSlice = new Uint8Array(
      fileBuffer.slice(i * chunkSize, (i + 1) * chunkSize))
    promises.push(
      this.storeChunk(i, aSlice)
        .catch(errorHandler(new Error('Part ' + i + ' was not stored'))))
  }
  return Promise.all(promises)
}

/**
 * Define the file's information and store it locally
 * @return {Promise} A promise to store the info
 * @function Media#buildInfoFromLocal
 */
export function buildInfoFromLocal(size, nbrParts) {
  var info = {
    url: this.url,
    parts: nbrParts,
    size: size,
    remote: {},
    available: []
  }

  this.info = info

  return this.storeInfo(info)
}

/**
 * Update the info of the media and store it in local storage
 *
 * @param {Info} info - media's meta-data
 * @return {Promise}
 * @function Media#storeInfo
 */
export function storeInfo(info) {
  return localforage
    .setItem(info.url + '-info', info)
    .catch(function(e) {
      console.error(e)
    })
}

/**
 * Store a chunk of data associated to a part number
 *
 * @param {number} partNumber
 * @param {Array} data - The part of the media we need to store
 * @function Media#storeChunk
 */
export function storeChunk(partNumber, data) {

  // Remove part if it was pending
  var id = this.pendingParts.indexOf(partNumber)
  if(id !== -1) {
    delete this.pendingParts[id]
  }

  if(this.info.available.indexOf(partNumber) !== -1) {
    console.debug('Part already stored')
    return Promise.resolve()
  }

  this.info.available.push(partNumber)
  // Number of stored chunks
  var nbrAvail = this.info.available.length
  var retour = localforage.setItem(this.url + '-part' + partNumber, data)

  if(nbrAvail === this.info.parts) {
    console.info('Last part of the media has been stored')
    retour.then(() => this.isComplete(true))
  }

  return retour
}

/**
 * Get media information from local storage
 *
 * @return {Promise} Promise returning the info object as firest parameter
 * @function Media#getInfo
 */
export function getInfo() {
  return localforage
    .getItem(this.url + '-info')
    .catch(function(e) {
      console.error(e)
    })
}

/**
 * Get a media chunk from local storage
 *
 * @param {number} partNumber - The number of the desired chunk
 * @return {Promise} Prmosie returning the chunk as first parameter
 * @function Media#getChunk
 */
export function getChunk(partNumber) {
  return localforage
    .getItem(this.url + '-part' + partNumber)
    .catch(function(e) {
      console.error(e)
    })
}

/**
 * Load a media from localstorage in a HTMLMediaElement with Media Source
 *
 * @param {HTMLMediaElement} video - Video tag where the file should be played
 * @param {string} fileName - the name of the local file (most likely it's url)
 * @function Media#loadMediasourceFromStoredFile
 */
export function loadMediasourceFromStoredFile(video) {

  console.debug('Loading from storage')

  var mediaSource = new MediaSource()
  var fileUrl = this.url
  /**
   * We have to wait for the chunk to be completly written before appending the
   * next chunk ("updateended" event)
   */
  var readChunk = function(sourceBuffer, partNumber, lastNumber) {
    // Get the chunk from storage
    localforage.getItem(fileUrl + '-part' + partNumber).then(function(chunk) {
      // When current chunk will be written this event will be called
      sourceBuffer.addEventListener('updateend', function selfHandle() {
        // We remove this event to create a new one with updated values
        sourceBuffer.removeEventListener('updateend', selfHandle)
        if(partNumber < lastNumber) {
          // Some remaining chunks, we loop
          readChunk(sourceBuffer, partNumber + 1, lastNumber)
        } else {
          // Last chunk written in buffer, the stream is complete
          console.info('Media is fully loaded')
          mediaSource.endOfStream()
        }
      })
      // Write current chunk
      sourceBuffer.appendBuffer(chunk)
    }).catch(function(e) {
      console.error(e)
    })
  }

  // When mediaSource is ready we append the parts in a new source buffer.
  mediaSource.addEventListener('sourceopen', function() {
    localforage.getItem(fileUrl + '-info').then(function(info) {
      // TODO Check the codecs
      var codec = 'video/webm; codecs="vorbis, vp8"'
      var sourceBuffer = mediaSource.addSourceBuffer(codec)
      // Start recursion
      readChunk(sourceBuffer, 0, info.parts - 1)
    })
  }, false)

  // Triggers the "sourceopen" event of the MediaSource object
  video.src = window.URL.createObjectURL(mediaSource)
}
