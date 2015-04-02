#!/bin/bash
# Change for CommonJS modules
rm -rf doc
./node_modules/.bin/esperanto -s -d temp/ -i ./src/ -o temp/src/
cp package.json temp/
# Remove other ES6 features
./node_modules/.bin/babel temp/src --source-root temp/src --out-dir temp/src
./node_modules/.bin/jsdoc temp/src -r -P package.json -d doc -R README.md
rm -r temp
