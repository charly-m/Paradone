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

/**
 * @module util
 */

/**
 * Special wrapping for promise related errors with line number
 * @param {Error} e - Contains detailed information on the error
 */
export function error(e) {
  return function(err) {
    console.warn('Error line ', e.lineNumber)
    console.error(err)
  }
}

/**
 * Special definition for type extension and correct prototype chain
 */
export function extend(base, sub) {
  // Also, do a recursive merge of two prototypes, so we don't overwrite the
  // existing prototype, but still maintain the inheritance chain
  var origProto = sub.prototype
  sub.prototype = Object.create(base.prototype)

  Object.keys(origProto).forEach(function(key) {
    sub.prototype[key] = origProto[key]
  })

  // Remember the constructor property was set wrong, let's fix it
  sub.prototype.constructor = sub
  // In ECMAScript5+ (all modern browsers), you can make the constructor
  // property non-enumerable if you define it like this instead
  Object.defineProperty(sub.prototype, 'constructor', {
    enumerable: false,
    value: sub
  })
}

/**
 * Returns a shallow copy of an array with its elements shuffled
 *
 * @inner
 * @memberof module:util
 * @param {Array} array - Source array
 * @return {Array} Shuffled elements in a shallow copy
 */
export function shuffleArray(array) {
  var i, j, temp
  var result = array.slice()
  for(i = array.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1))
    temp = result[i]
    result[i] = result[j]
    result[j] = temp
  }
  return result
}

/**
 * Returns a shallow copy of an array with its elements sorted
 *
 * @inner
 * @memberof module:util
 * @param {Function} sortFunction -
 * @param {Array} array - Source array
 * @return {Array} Sorted elements in a shallow copy
 */
export function shallowSort(sortFunction, array) {
  return array.slice().sort(sortFunction)
}
